import { boardCost } from './analysis.js';
import { checkDeck } from './deck.js';
import { rng, shuffle } from './simulation.js';
import { effectCoverage, effectsAt, printedKeyword } from './arena-effects.js';

const omit = (list, item) => list.splice(list.indexOf(item), 1)[0];
const enemy = side => 1 - side;
const traitsMatch = (card, names) => names.some(name => card.traits.some(value => value.toLowerCase().includes(name.toLowerCase())));
const nameMatches = (card, names) => names.some(name => card.name.toLowerCase().replaceAll('.', '') === name.toLowerCase().replaceAll('.', ''));
const moveLabels = { ko: 'K.O.', bounce: 'Devuelve a la mano', bottom: 'Coloca al fondo', trash: 'Envía al descarte' };
const timingLabels = { play: 'Al jugar', attack: 'Al atacar', defend: 'Ataque rival', block: 'Al bloquear', ko: 'Al quedar K.O.',
  effectKO: 'K.O. por efecto', activate: 'Activación principal', main: 'Principal', trigger: 'Trigger',
  counter: 'Counter', end: 'Fin de turno', returnDon: 'Al devolver DON!!', leaderBattle: 'Combate del líder' };
const manualMoves = new Set(['ko', 'bounce', 'bottom', 'trash', 'rest', 'ready', 'power', 'basePower', 'negateKO', 'freezeAttack', 'freezeReady', 'protectRest', 'grant']);

export class Arena {
  constructor(list, rival, catalog, rules, { seed = 17, first = true } = {}) {
    for (const deck of [list, rival]) {
      const errors = checkDeck(deck, catalog, rules);
      if (errors.length) throw new Error(errors.join('\n'));
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Indica una semilla válida.');
    this.catalog = catalog;
    this.first = first ? 0 : 1;
    this.seed = seed;
    this.turn = this.first;
    this.ply = 0;
    this.players = [];
    this.log = [];
    this.steps = [];
    this.phase = 'mulligan';
    this.battle = null;
    this.pending = null;
    this.result = null;
    this.nextId = 1;
    this.nextChain = 1;
    this.sequence = 0;
    this.motion = null;
    this.botAttaches = new Set();
    this.botActivated = new Set();
    this.data = [list, rival];
    const random = rng(seed);
    for (const [side, deck] of [list, rival].entries()) {
      const unit = code => this.unit(code, side);
      const leader = unit(deck.leader);
      const pool = Object.entries(deck.cards).sort(([a], [b]) => a.localeCompare(b)).flatMap(([code, n]) => Array.from({ length: n }, () => unit(code)));
      const stage = deck.leader === 'OP13-079' ? pool.find(unit => unit.code === 'OP13-099') ??
        pool.find(unit => catalog[unit.code].kind === 'Stage' && traitsMatch(catalog[unit.code], ['Mary Geoise'])) : null;
      if (stage) omit(pool, stage);
      const library = shuffle(pool, random);
      const firstHand = library.splice(0, 5);
      const secondShuffle = shuffle(pool, random);
      const poolCards = [...new Set(pool.map(card => card.code))].map(code => catalog[code]);
      this.players.push({ leader, poolCards, library, firstHand, secondShuffle, hand: firstHand, life: [], board: [],
        trash: [], stage, capacity: deck.don, don: { active: 0, rested: 0, frozenNext: 0 },
        turns: 0, stats: { attacks: 0, played: 0, defense: 0, draws: 0, damage: 0, manual: 0 } });
    }
  }

  unit(code, side) {
    return { code, side, id: this.nextId++, rested: false, don: 0, created: 0, power: [], flags: {}, used: {} };
  }

  card(unit) { return this.catalog[unit.code]; }
  name(unit) { return this.card(unit).name; }
  label(side) { return side === 0 ? 'Tú' : 'Rival'; }
  actor(side) { return side === 0 ? 'Tu tripulación' : 'El rival'; }
  field(side) { const p = this.players[side]; return [p.leader, ...p.board, ...(p.stage ? [p.stage] : [])]; }
  find(id) { return [...this.field(0), ...this.field(1)].find(card => card.id === id); }
  team(unit) { return this.players[unit.side]; }
  char(unit) { return this.card(unit).kind === 'Character'; }
  livingCharacters(side) { return this.players[side].board; }
  isLeader(unit) { return this.players[unit.side].leader === unit; }
  onField(unit) { return this.field(unit.side).includes(unit); }
  donTotal(side) {
    const p = this.players[side];
    return p.don.active + p.don.rested + this.field(side).reduce((n, unit) => n + unit.don, 0);
  }
  life(side) { return this.players[side].life.length; }
  cost(unit, printed = false) { return printed ? this.card(unit).cost : boardCost(this.card(unit), this.card(this.team(unit).leader)); }
  flag(unit, name) { return unit.flags[name] === this.ply || unit.flags[name] === true; }

  keyword(unit, name) {
    if (this.flag(unit, 'negated')) return false;
    if (name === 'Blocker' && unit.code === 'OP13-031' && this.life(unit.side) <= 1) return true;
    if (name === 'Blocker' && this.team(unit).leader.code === 'OP17-079' && this.char(unit) && this.cost(unit) >= 12) return true;
    return this.flag(unit, name) || printedKeyword(this.card(unit), name);
  }

  power(unit) {
    const base = unit.flags.basePowerPly === this.ply ? unit.flags.basePower : this.card(unit).power;
    const player = this.team(unit);
    const stage = this.turn === unit.side && this.isLeader(unit) && player.stage?.code === 'OP13-099' && player.trash.length >= 19 ? 1000 : 0;
    return base + stage + (this.turn === unit.side ? unit.don * 1000 : 0) + unit.power.reduce((n, buff) => n + buff.amount, 0);
  }

  counter(unit) {
    const p = this.team(unit);
    const card = this.card(unit);
    if (card.counter || card.kind !== 'Character') return card.counter;
    if (unit.code === 'OP17-118' && !p.hand.some(other => this.char(other) && this.card(other).counter > 0)) return 2000;
    return p.board.some(other => other.code === 'OP17-063' && !this.flag(other, 'negated')) ? 1000 : 0;
  }

  record(kind, text, units = []) {
    const entry = { seq: ++this.sequence, kind, text, ids: units.map(unit => unit.id),
      units: units.map(({ code, side }) => ({ code, side })) };
    this.log.push(entry);
    if (['deploy', 'attack', 'impact', 'block', 'effect', 'ko'].includes(kind)) this.motion = entry;
    if (this.log.length > 150) this.log.shift();
  }

  coverage(unit) {
    const player = this.team(unit);
    return effectCoverage(this.card(unit), this.card(player.leader), player.poolCards, player.capacity);
  }

  program(unit, timing) {
    if (this.flag(unit, 'negated')) return null;
    if (timing === 'play' && this.card(this.team(unit).leader).effects?.persistent_on_play_lock) return null;
    const rival = this.players[enemy(unit.side)];
    if (timing === 'play' && this.card(rival.leader).effects?.opponent_on_play_lock) {
      // A conditional lock needs a reviewed activation window or a manual adjustment.
      if (rival.leader.flags.lockOnPlayUntil >= this.team(unit).turns) return null;
    }
    const p = this.team(unit);
    return effectsAt(this.card(unit), timing, this.card(p.leader), p.poolCards, p.capacity);
  }

  start(mulligan) {
    if (this.phase !== 'mulligan') return;
    for (const [side, p] of this.players.entries()) {
      if (side === 0 ? mulligan : !p.hand.some(unit => this.char(unit) && this.card(unit).cost <= (this.first === side ? 1 : 2))) {
        p.hand = p.secondShuffle.slice(0, 5);
        p.library = p.secondShuffle.slice(5);
        this.record('draw', this.actor(side) + ' cambió la mano inicial.');
      }
      p.secondShuffle = [];
      p.firstHand = [];
      if (p.stage) this.record('deploy', this.name(p.stage) + ' abre la partida.', [p.stage]);
      p.life = p.library.splice(0, this.card(p.leader).life);
    }
    this.begin(this.first);
  }

  begin(side) {
    if (this.result) return;
    const p = this.players[side];
    this.turn = side;
    this.ply++;
    this.botAttaches.clear();
    this.botActivated.clear();
    p.turns++;
    this.record('turn', 'Turno ' + p.turns + ' · ' + this.label(side) + '.');
    p.don.active = p.don.rested + p.don.active - p.don.frozenNext;
    for (const unit of this.field(side)) {
      p.don.active += unit.don;
      unit.don = 0;
      if (unit.flags.skipReady) delete unit.flags.skipReady;
      else unit.rested = false;
    }
    p.don.rested = p.don.frozenNext;
    p.don.frozenNext = 0;
    this.record('turn', 'Refresco · ' + this.actor(side) + ' recupera recursos.');
    if (this.ply > 1) this.draw(side, 1);
    else this.record('turn', 'Robo · se omite en el primer turno de la partida.');
    if (this.result) return;
    this.gainDon(side, this.ply === 1 ? 1 : 2, true);
    this.phase = 'main';
    this.record('turn', 'Principal · ' + p.don.active + ' DON!! activos.');
  }

  draw(side, n) {
    if (n <= 0 || this.result) return;
    const p = this.players[side];
    const drawn = p.library.splice(0, n);
    p.hand.push(...drawn);
    p.stats.draws += drawn.length;
    if (drawn.length) this.record('draw', this.actor(side) + ' roba ' + drawn.length + (drawn.length === 1 ? ' carta.' : ' cartas.'));
    if (!p.library.length) this.finish(enemy(side), (side === 0 ? 'Tu mazo' : 'El mazo rival') + ' se agotó.');
  }

  finish(winner, text) {
    this.pending = null;
    this.steps = [];
    this.battle = null;
    this.phase = 'over';
    this.result = { winner, text };
    this.record('impact', (winner === 0 ? 'Victoria. ' : 'Derrota. ') + text);
  }

  main(side) { return !this.result && this.phase === 'main' && this.turn === side && !this.pending; }

  gainDon(side, n, active, announce = true) {
    const p = this.players[side];
    const gained = Math.min(n, p.capacity - this.donTotal(side));
    p.don[active ? 'active' : 'rested'] += gained;
    if (announce && gained) this.record('effect', this.actor(side) + ' añade ' + gained + ' DON!! ' + (active ? 'activos.' : 'descansados.'));
  }

  readyDon(side, n) {
    const p = this.players[side];
    const count = Math.min(n, p.don.rested);
    p.don.active += count;
    p.don.rested -= count;
    p.don.frozenNext = Math.min(p.don.frozenNext, p.don.rested);
    if (count) this.record('effect', this.actor(side) + ' activa ' + count + ' DON!!.');
  }

  returnDon(side, n) {
    if (this.donTotal(side) < n) return false;
    for (let i = 0; i < n; i++) {
      const [option] = this.returnSources(side);
      this.takeDon(side, option);
    }
    this.noteReturned(side, n);
    return true;
  }

  returnSources(side) {
    const p = this.players[side];
    return [
      ...(p.don.rested ? [{ key: 'rested', label: 'Descansado · ' + p.don.rested }] : []),
      ...(p.don.active ? [{ key: 'active', label: 'Activo · ' + p.don.active }] : []),
      ...this.field(side).filter(unit => unit.don > 0).map(unit => ({ unit, label: 'Asignado a ' + this.name(unit) + ' · ' + unit.don }))
    ];
  }

  takeDon(side, option) {
    const p = this.players[side];
    if (option.unit) option.unit.don--;
    else {
      p.don[option.key]--;
      p.don.frozenNext = Math.min(p.don.frozenNext, p.don.rested);
    }
  }

  noteReturned(side, n) {
    const p = this.players[side];
    this.record('effect', this.actor(side) + ' devuelve ' + n + ' DON!! al mazo de DON!!.');
    if (this.turn === side) for (const unit of p.board) this.queue(unit, 'returnDon', true);
  }

  chooseReturnedDon(side, remaining, total) {
    if (!remaining) { this.noteReturned(side, total); return; }
    const options = this.returnSources(side);
    const take = option => {
      this.takeDon(side, option);
      this.chooseReturnedDon(side, remaining - 1, total);
    };
    if (options.length === 1) take(options[0]);
    else this.ask(side, 'Devuelve DON!! · ' + (total - remaining + 1) + '/' + total, options, take, { required: true });
  }

  attach(id) {
    const unit = this.find(id);
    if (!unit || !this.main(unit.side) || (!this.isLeader(unit) && !this.char(unit)) || !this.team(unit).don.active) return false;
    this.team(unit).don.active--;
    unit.don++;
    this.record('effect', 'DON!! asignado a ' + this.name(unit) + '.', [unit]);
    return true;
  }

  canRest(unit) {
    return !unit.rested && !(unit.flags.noRestUntil >= this.players[unit.side].turns);
  }

  canPlay(unit) {
    if (!unit || !this.main(unit.side) || !this.team(unit).hand.includes(unit) || this.team(unit).don.active < this.card(unit).cost) return false;
    const ops = this.card(unit).kind === 'Event' ? this.program(unit, 'main') : null;
    return this.card(unit).kind !== 'Event' || Boolean(ops && this.afford(unit, ops, this.card(unit).cost));
  }

  deploy(id, side = this.turn) {
    const unit = this.players[side].hand.find(item => item.id === id);
    if (!this.canPlay(unit)) return false;
    if (this.char(unit) && this.team(unit).board.length === 5) {
      this.ask(side, 'Reemplaza un personaje de tu campo', this.team(unit).board, choice => {
        if (!choice) return;
        this.move(choice, 'trash');
        this.playCard(unit, { pay: true });
      });
    } else this.playCard(unit, { pay: true });
    this.pump();
    return true;
  }

  playCard(unit, { pay = false, rested = false } = {}) {
    const p = this.team(unit);
    const card = this.card(unit);
    if (!p.hand.includes(unit) || (pay && p.don.active < card.cost) || (card.kind === 'Character' && p.board.length >= 5)) return;
    omit(p.hand, unit);
    if (pay) {
      p.don.active -= card.cost;
      p.don.rested += card.cost;
    }
    if (card.kind === 'Event') {
      p.trash.push(unit);
      this.record('effect', this.actor(unit.side) + ' juega ' + card.name + '.', [unit]);
      this.queue(unit, 'main', true);
      return;
    }
    unit.created = this.ply;
    unit.rested = rested;
    unit.don = 0;
    unit.power = [];
    unit.used = {};
    unit.flags = {};
    if (card.kind === 'Stage') {
      if (p.stage) this.move(p.stage, 'trash');
      p.stage = unit;
    } else p.board.push(unit);
    p.stats.played++;
    this.record('deploy', this.actor(unit.side) + ' despliega ' + card.name + '.', [unit]);
    this.queue(unit, 'play', true);
  }

  move(unit, action) {
    const p = this.team(unit);
    if (p.stage === unit) p.stage = null;
    else if (p.board.includes(unit)) omit(p.board, unit);
    else return false;
    p.don.rested += unit.don;
    unit.don = 0;
    if (action === 'bounce') p.hand.push(unit);
    else if (action === 'bottom') p.library.push(unit);
    else p.trash.push(unit);
    this.record(action === 'ko' ? 'ko' : 'effect', moveLabels[action] + ' · ' + this.name(unit) + '.', [unit]);
    return true;
  }

  discard(unit) {
    const p = this.team(unit);
    if (!p.hand.includes(unit)) return;
    omit(p.hand, unit);
    p.trash.push(unit);
    for (const other of p.board) if (other.code === 'OP14-049' && !this.flag(other, 'negated')) other.flags.Rush = this.ply;
    this.record('effect', this.actor(unit.side) + ' descarta ' + this.name(unit) + '.', [unit]);
  }

  protect(unit, action, sourceSide) {
    const p = this.team(unit);
    const other = sourceSide !== unit.side;
    const choices = [];
    if (action === 'ko' && unit.code === 'EB04-031' && !this.flag(unit, 'negated') && this.donTotal(unit.side)) {
      choices.push({ key: 'king', label: 'King · devolver 1 DON!!' });
    }
    if (other && sourceSide !== null) {
      const alive = code => p.board.some(item => item.code === code && !this.flag(item, 'negated'));
      if (alive('OP17-045') && p.hand.length >= 2) choices.push({ key: 'kyo', label: 'Kyo · descartar dos cartas' });
      if (alive('OP15-069') && this.card(unit).power <= 7000 && this.donTotal(unit.side)) choices.push({ key: 'nola', label: 'Nola · devolver 1 DON!!' });
      if (alive('OP17-021') && traitsMatch(this.card(unit), ['Red-Haired Pirates']) && this.field(unit.side).some(item => this.canRest(item))) {
        choices.push({ key: 'oli', label: 'Crone Oli · descansar una carta' });
      }
    }
    const remove = () => {
      if (!this.move(unit, action)) return;
      if (action === 'ko') {
        this.queue(unit, 'ko', true);
        if (sourceSide !== null && other) this.queue(unit, 'effectKO', true);
      }
    };
    if (!choices.length) return remove();
    this.ask(unit.side, 'Protección de ' + this.name(unit), choices, choice => {
      if (!choice) return remove();
      if (choice.key === 'king' || choice.key === 'nola') {
        this.returnDon(unit.side, 1);
        return;
      }
      if (choice.key === 'kyo') {
        this.pickMany(unit.side, 'Descarta dos cartas para proteger a ' + this.name(unit), () => p.hand, 2, card => this.discard(card), remove);
      } else {
        this.ask(unit.side, 'Descansa una carta para proteger a ' + this.name(unit), this.field(unit.side).filter(card => this.canRest(card)), card => {
          if (card) card.rested = true;
          else remove();
        });
      }
    });
  }

  activate(id) {
    const unit = this.find(id);
    if (!unit || !this.canActivate(unit)) return false;
    this.queue(unit, 'activate');
    this.pump();
    return true;
  }

  canActivate(unit) {
    if (!this.main(unit.side) || !this.onField(unit)) return false;
    const ops = this.program(unit, 'activate');
    return Boolean(ops && this.afford(unit, ops));
  }

  canAttack(unit) {
    if (!unit || !this.main(unit.side) || !this.onField(unit) || this.team(unit).turns < 2 || !this.canRest(unit) ||
      unit.flags.noAttackUntil >= this.team(unit).turns) return false;
    return this.isLeader(unit) || (this.char(unit) && (unit.created < this.ply || this.keyword(unit, 'Rush') || this.keyword(unit, 'Rush: Character')));
  }

  targets(unit) {
    if (!this.canAttack(unit)) return [];
    const other = this.players[enemy(unit.side)];
    const characters = other.board.filter(card => card.rested);
    const forced = characters.find(card => card.code === 'OP17-044' && !this.flag(card, 'negated') && traitsMatch(this.card(other.leader), ['Rocks Pirates']));
    if (forced) return [forced];
    const rushOnly = !this.isLeader(unit) && unit.created === this.ply && !this.keyword(unit, 'Rush') && this.keyword(unit, 'Rush: Character');
    return rushOnly ? characters : [other.leader, ...characters];
  }

  attack(id, target) {
    const unit = this.find(id);
    const defender = this.find(target);
    if (!unit || !this.targets(unit).includes(defender)) return false;
    unit.rested = true;
    this.team(unit).stats.attacks++;
    this.battle = { attacker: unit, defender, blocker: null };
    this.phase = 'pre-block';
    this.record('attack', this.name(unit) + ' ataca a ' + this.name(defender) + '.', [unit, defender]);
    this.queue(unit, 'attack');
    if (this.isLeader(unit)) for (const friend of this.team(unit).board) this.queue(friend, 'leaderBattle');
    for (const targetCard of this.field(defender.side)) this.queue(targetCard, 'defend');
    if (this.isLeader(defender)) for (const friend of this.team(defender).board) this.queue(friend, 'leaderBattle');
    this.pump();
    return true;
  }

  blockers() {
    if (this.phase !== 'block' || this.pending || !this.battle || this.keyword(this.battle.attacker, 'Unblockable')) return [];
    return this.team(this.battle.defender).board.filter(unit => unit !== this.battle.defender && this.canRest(unit) && this.keyword(unit, 'Blocker'));
  }

  block(id = null) {
    if (this.phase !== 'block' || this.pending) return false;
    if (id != null) {
      const unit = this.blockers().find(card => card.id === id);
      if (!unit) return false;
      unit.rested = true;
      this.battle.blocker = unit;
      this.battle.defender = unit;
      this.record('block', this.name(unit) + ' intercepta el ataque.', [unit]);
      this.queue(unit, 'block');
    }
    this.phase = 'counter';
    this.pump();
    return true;
  }

  counters() {
    if (this.phase !== 'counter' || this.pending || !this.battle) return [];
    const p = this.team(this.battle.defender);
    return p.hand.filter(unit => this.counter(unit) > 0 ||
      (this.card(unit).kind === 'Event' && p.don.active >= this.card(unit).cost &&
        this.program(unit, 'counter') && this.afford(unit, this.program(unit, 'counter'), this.card(unit).cost)));
  }

  useCounter(id) {
    const unit = this.counters().find(card => card.id === id);
    if (!unit) return false;
    const p = this.team(unit);
    const n = this.counter(unit);
    omit(p.hand, unit);
    p.trash.push(unit);
    if (n) {
      this.battle.defender.power.push({ amount: n, battle: true });
      this.record('block', this.name(unit) + ' aporta +' + n + ' de Counter.', [this.battle.defender]);
    } else {
      p.don.active -= this.card(unit).cost;
      p.don.rested += this.card(unit).cost;
      this.queue(unit, 'counter');
    }
    p.stats.defense++;
    this.pump();
    return true;
  }

  resolveBattle() {
    if (this.phase !== 'counter' || this.pending || !this.battle) return false;
    const { attacker, defender } = this.battle;
    const hit = this.power(attacker) >= this.power(defender);
    this.phase = 'damage';
    this.record(hit ? 'impact' : 'block', this.name(attacker) + ' · ' + this.power(attacker) + ' frente a ' + this.power(defender) +
      (hit ? ' · Impacto.' : ' · Ataque defendido.'), [defender]);
    if (hit && this.isLeader(defender)) {
      const remaining = this.life(defender.side);
      if (!remaining) {
        this.finish(attacker.side, this.name(defender) + ' recibió daño sin Vida restante.');
        return true;
      }
      const n = Math.min(remaining, this.keyword(attacker, 'Double Attack') ? 2 : 1);
      const banish = this.keyword(attacker, 'Banish');
      this.team(attacker).stats.damage += n;
      this.steps.push(...Array.from({ length: n }, () => ({ type: 'damage', side: defender.side, banish, unit: defender })));
    } else if (hit) this.protect(defender, 'ko', null);
    this.pump();
    return true;
  }

  endTurn() {
    if (!this.main(this.turn)) return false;
    this.phase = 'ending';
    for (const unit of this.field(this.turn)) this.queue(unit, 'end');
    this.pump();
    return true;
  }

  queue(unit, timing, next = false) {
    const ops = this.program(unit, timing);
    if (!ops || !this.afford(unit, ops)) return;
    const chain = this.nextChain++;
    const once = ops.find(op => op.type === 'once');
    const tasks = ops.filter(op => op.type !== 'once').map(op => ({ ...op, unit, side: unit.side, timing, chain }));
    if (once) tasks.push({ ...once, unit, side: unit.side, timing, chain });
    if (['play', 'attack', 'defend', 'leaderBattle', 'block', 'effectKO'].includes(timing) &&
        ops.some(op => ['payDon', 'returnDon', 'trashSelf'].includes(op.type)) &&
        !ops.some(op => op.type === 'payTrash' && !op.required)) {
      tasks.unshift({ type: 'confirm', unit, side: unit.side, timing, chain });
    }
    this.record('effect', this.name(unit) + ' · ' + timingLabels[timing] + '.', [unit]);
    if (next) this.steps.unshift(...tasks);
    else this.steps.push(...tasks);
  }

  afford(unit, ops, printedCost = 0) {
    const p = this.team(unit);
    const once = ops.find(op => op.type === 'once');
    const unique = ops.find(op => op.type === 'checkSingleton');
    const self = ops.some(op => op.type === 'restSelf');
    return (!once || unit.used[once.key] !== this.ply) &&
      ops.filter(op => op.type === 'payDon').reduce((n, op) => n + op.n, printedCost) <= p.don.active &&
      ops.filter(op => op.type === 'returnDon').reduce((n, op) => n + op.n, 0) <= this.donTotal(unit.side) &&
      ops.filter(op => op.type === 'leaderTrait').every(op => traitsMatch(this.card(p.leader), op.names)) &&
      ops.filter(op => op.type === 'payTrash' && !op.required).every(op => p.hand.filter(card =>
        card !== unit && (!op.trait || traitsMatch(this.card(card), [op.trait]))).length >= op.n) &&
      (!ops.some(op => op.type === 'attached' && unit.don < op.n)) &&
      ops.filter(op => op.type === 'boardTrait').every(op => p.board.filter(card => traitsMatch(this.card(card), [op.trait])).length >= op.n) &&
      (!self || this.canRest(unit)) && (!unique || !p.board.some(other => other !== unit && nameMatches(this.card(other), [unique.name]))) &&
      (!ops.some(op => op.type === 'playedNow') || unit.created === this.ply);
  }

  ask(side, label, items, callback, { required = false, pass = 'Omitir', manual = false } = {}) {
    if (!items.length && !manual) {
      callback(null);
      return;
    }
    this.pending = { side, label, items, callback, required, pass, manual };
  }

  choose(index) {
    const prompt = this.pending;
    if (!prompt) return false;
    const item = index === -1 ? null : prompt.items[index];
    if (!item && (prompt.required || index !== -1)) return false;
    this.pending = null;
    prompt.callback(item);
    this.pump();
    return true;
  }

  pickMany(side, label, pool, n, effect, skipped, i = 0) {
    if (i >= n) return;
    const items = pool();
    if (items.length + i < n && i === 0) return skipped?.();
    this.ask(side, label + (n > 1 ? ' · ' + (i + 1) + '/' + n : ''), items, item => {
      if (!item) return skipped?.();
      effect(item);
      this.pickMany(side, label, pool, n, effect, skipped, i + 1);
    }, { required: i > 0 || !skipped });
  }

  endBattle() {
    for (const side of [0, 1]) for (const unit of this.field(side)) unit.power = unit.power.filter(effect => !effect.battle);
    this.battle = null;
    this.phase = 'main';
  }

  pump() {
    while (!this.pending && this.steps.length && !this.result) this.runStep(this.steps.shift());
    if (this.pending || this.result) return;
    if (this.battle && (!this.onField(this.battle.attacker) || !this.onField(this.battle.defender)) && this.phase !== 'damage') {
      this.record('impact', 'El combate termina al salir uno de sus participantes.');
      this.endBattle();
    } else if (this.phase === 'pre-block') {
      this.phase = 'block';
      if (!this.blockers().length) this.phase = 'counter';
    } else if (this.phase === 'damage') this.endBattle();
    else if (this.phase === 'ending') {
      for (const side of [0, 1]) {
        for (const unit of this.field(side)) {
          unit.power = [];
          for (const key of ['noAttackUntil', 'noRestUntil']) {
            if (unit.side === this.turn && unit.flags[key] <= this.team(unit).turns) delete unit.flags[key];
          }
        }
      }
      this.begin(enemy(this.turn));
    }
  }

  pickField(task) {
    if (task.onlyLeader || task.onlyRivalLeader) {
      const leader = this.players[task.onlyRivalLeader ? enemy(task.side) : task.side].leader;
      return this.matches(leader, task) ? [leader] : [];
    }
    const sides = task.both ? [task.side, enemy(task.side)] : [task.own ? task.side : enemy(task.side)];
    return sides.flatMap(side => this.field(side).filter(unit => (this.char(unit) || (task.leader && this.isLeader(unit))) &&
      this.matches(unit, task) && (!task.skipped?.includes(unit.id)) &&
      (task.action !== 'rest' || this.canRest(unit)) && (task.action !== 'ready' || unit.rested)));
  }

  matches(unit, task) {
    const card = this.card(unit);
    return this.cost(unit, task.printed) <= (task.maxCost ?? Infinity) &&
      (!task.rested || unit.rested) && this.power(unit) <= (task.maxPower ?? Infinity) &&
      (!(task.trait || task.traits) || traitsMatch(card, task.traits ?? [task.trait])) &&
      (!task.names || nameMatches(card, task.names)) && (!task.color || card.colors.includes(task.color));
  }

  affect(unit, task) {
    const p = this.team(unit);
    switch (task.action) {
      case 'power':
        unit.power.push({ amount: task.amount, battle: Boolean(task.battle) });
        this.record('effect', this.name(unit) + ' ' + (task.amount >= 0 ? '+' : '−') + Math.abs(task.amount) + ' de poder.', [unit]);
        break;
      case 'basePower':
        unit.flags.basePower = task.amount;
        unit.flags.basePowerPly = this.ply;
        this.record('effect', 'Poder base de ' + this.name(unit) + ' pasa a ' + task.amount + '.', [unit]);
        break;
      case 'grant':
        unit.flags[task.flag] = this.ply;
        this.record('effect', this.name(unit) + ' gana ' + task.flag + '.', [unit]);
        break;
      case 'rest':
        if (this.canRest(unit)) {
          unit.rested = true;
          this.record('effect', this.name(unit) + ' queda descansado.', [unit]);
        }
        break;
      case 'ready':
        unit.rested = false;
        this.record('effect', this.name(unit) + ' queda activo.', [unit]);
        break;
      case 'freezeAttack':
        unit.flags.noAttackUntil = p.turns + 1;
        this.record('effect', this.name(unit) + ' pierde su próxima oportunidad de atacar.', [unit]);
        break;
      case 'freezeReady':
        unit.flags.skipReady = true;
        this.record('effect', this.name(unit) + ' se quedará descansado al refrescar.', [unit]);
        break;
      case 'protectRest':
        unit.flags.noRestUntil = p.turns + 1;
        this.record('effect', this.name(unit) + ' queda protegido de descanso.', [unit]);
        break;
      case 'negateKO':
        unit.flags.negated = this.ply;
        this.protect(unit, 'ko', task.side);
        break;
      default: this.protect(unit, task.action, task.side);
    }
  }

  targetStep(task) {
    const cards = this.pickField(task);
    const labels = { power: 'Escoge quién recibe ' + (task.amount > 0 ? '+' : '') + task.amount + ' de poder',
      basePower: 'Escoge quién cambia su poder base', rest: 'Escoge a quién descansar', ready: 'Escoge a quién activar',
      freezeReady: 'Escoge quién sigue descansado al refrescar', freezeAttack: 'Escoge a quién impedir atacar',
      protectRest: 'Escoge a quién proteger de descanso', grant: 'Escoge quién gana ' + task.flag,
      negateKO: 'Escoge a quién anular y enviar K.O.' };
    this.ask(task.side, labels[task.action] ?? moveLabels[task.action], cards, choice => {
      if (!choice && task.required) this.cancelChain(task.chain);
      if (!choice) return;
      const count = (task.count ?? 1) - 1;
      if (count > 0) this.steps.unshift({ ...task, count, skipped: [...(task.skipped ?? []), choice.id] });
      this.affect(choice, task);
    }, { required: Boolean(task.required) });
  }

  cancelChain(chain) { this.steps = this.steps.filter(task => task.chain !== chain); }

  scout(task) {
    const p = this.players[task.side];
    const peek = p.library.slice(0, task.depth);
    if (!peek.length) return;
    const available = peek.filter(unit => task.codes ? task.codes.includes(unit.code) : traitsMatch(this.card(unit), task.traits));
    const finish = choice => {
      p.library.splice(0, peek.length);
      const rest = peek.filter(unit => unit !== choice);
      if (choice) p.hand.push(choice);
      else this.record('effect', this.actor(task.side) + ' pasa la búsqueda.');
      if (choice) this.record('effect', this.actor(task.side) + ' encuentra ' + this.name(choice) + '.', [choice]);
      if (task.miss === 'trash') p.trash.push(...rest);
      else p.library.push(...rest);
      if (!p.library.length) this.finish(enemy(task.side), 'El mazo se agotó tras la búsqueda.');
    };
    this.ask(task.side, 'Revela un objetivo de las primeras ' + peek.length + ' cartas', available, finish);
  }

  doDamage(task) {
    const p = this.players[task.side];
    const card = p.life.shift();
    if (!card) return;
    this.record('impact', this.name(p.leader) + ' pierde una Vida.', [p.leader]);
    const hold = () => p.hand.push(card);
    if (task.banish) p.trash.push(card);
    else if (this.program(card, 'trigger')) {
      this.ask(task.side, 'Vida revelada · ' + this.name(card), [card], choice => {
        if (!choice) return hold();
        p.trash.push(card);
        this.queue(card, 'trigger', true);
      }, { pass: 'Añadir a la mano' });
    } else hold();
  }

  runStep(task) {
    const p = this.players[task.side];
    const cancel = () => this.cancelChain(task.chain);
    const stepCount = task.n ?? 1;
    switch (task.type) {
      case 'target': this.targetStep(task); break;
      case 'draw': this.draw(task.side, stepCount); break;
      case 'gainDon': this.gainDon(task.side, stepCount, task.active); break;
      case 'readyDon': this.readyDon(task.side, stepCount); break;
      case 'returnDon':
        if (this.donTotal(task.side) < stepCount) cancel();
        else this.chooseReturnedDon(task.side, stepCount, stepCount);
        break;
      case 'payDon':
        if (p.don.active < stepCount) { cancel(); break; }
        p.don.active -= stepCount;
        p.don.rested += stepCount;
        break;
      case 'payTrash':
        if (task.required && !p.hand.length) break;
        this.pickMany(task.side, 'Elige qué descartar', () => p.hand.filter(card => !task.trait || traitsMatch(this.card(card), [task.trait])),
          stepCount, card => this.discard(card), task.required ? null : cancel);
        break;
      case 'payBoard':
        this.pickMany(task.side, 'Elige una carta propia para descansar', () => this.field(task.side).filter(card => this.canRest(card)),
          stepCount, card => { card.rested = true; }, cancel);
        break;
      case 'restSelf':
        if (!this.onField(task.unit) || !this.canRest(task.unit)) { cancel(); break; }
        task.unit.rested = true;
        break;
      case 'trashSelf':
        if (!this.move(task.unit, 'trash')) cancel();
        break;
      case 'checkSingleton':
      case 'leaderTrait':
      case 'boardTrait':
      case 'attached':
      case 'playedNow': break;
      case 'once': task.unit.used[task.key] = this.ply; break;
      case 'donAtMost':
        if (this.donTotal(task.side) > stepCount) cancel();
        break;
      case 'confirm':
        this.ask(task.side, '¿Activar el efecto de ' + this.name(task.unit) + '?', [{ key: 'activate', label: 'Pagar y activar' }], choice => {
          if (!choice) cancel();
        });
        break;
      case 'search': this.scout(task); break;
      case 'damage': this.doDamage(task); break;
      case 'addLife':
        if (p.library.length) {
          p.life.unshift(p.library.shift());
          this.record('effect', this.name(p.leader) + ' gana una Vida.', [p.leader]);
          if (!p.library.length) this.finish(enemy(task.side), 'El mazo se agotó al añadir Vida.');
        }
        break;
      case 'revealDraw': {
        const unit = p.library[0];
        if (!unit) break;
        this.record('effect', this.actor(task.side) + ' revela ' + this.name(unit) + '.');
        if (traitsMatch(this.card(unit), [task.trait])) this.draw(task.side, stepCount);
        break;
      }
      case 'revealHand':
        this.pickMany(task.side, 'Revela una carta ' + task.trait, () => p.hand.filter(card =>
          !task.revealed?.includes(card.id) && traitsMatch(this.card(card), [task.trait])), stepCount, card => {
          (task.revealed ??= []).push(card.id);
          this.record('effect', this.actor(task.side) + ' revela ' + this.name(card) + '.');
        }, cancel);
        break;
      case 'reorder': {
        const top = p.library.slice(0, task.depth);
        this.ask(task.side, 'Elige cuál queda primero; las otras conservan su orden', top, choice => {
          if (!choice) return;
          const order = [choice, ...top.filter(card => card !== choice)];
          this.ask(task.side, '¿Dónde colocar las cartas?', [{ key: 'top', label: 'Arriba del mazo' }, { key: 'bottom', label: 'Fondo del mazo' }], place => {
            p.library.splice(0, top.length);
            if (place?.key === 'bottom') p.library.push(...order);
            else p.library.unshift(...order);
          }, { required: true });
        }, { required: true });
        break;
      }
      case 'playFromHand': {
        const budget = task.budgetDon ? this.donTotal(task.side) : (task.budget ?? Infinity);
        const choices = p.hand.filter(card => this.char(card) && this.matches(card, { ...task, printed: true }) &&
          this.card(card).cost <= budget && (!task.different || !task.namesUsed?.includes(this.card(card).name)));
        this.ask(task.side, 'Elige qué personaje desplegar con el efecto', choices, choice => {
          if (!choice) return;
          const play = () => {
            const count = (task.count ?? 1) - 1;
            if (count) this.steps.unshift({ ...task, count, budget: (task.budget ?? Infinity) - this.card(choice).cost,
              namesUsed: [...(task.namesUsed ?? []), this.card(choice).name] });
            if (task.after) this.steps.unshift({ ...task, type: task.after });
            this.playCard(choice, { rested: task.rested });
          };
          if (p.board.length < 5) play();
          else this.ask(task.side, 'Elige a quién reemplazar', p.board, target => {
            if (target) { this.move(target, 'trash'); play(); }
          });
        });
        break;
      }
      case 'lifeToHand':
        if (p.life.length) {
          p.hand.push(p.life.shift());
          this.record('effect', this.name(p.leader) + ' agrega una Vida a su mano.', [p.leader]);
        }
        break;
      case 'teachLock':
        p.leader.flags.lockOnPlayUntil = this.players[enemy(task.side)].turns + 1;
        this.record('effect', this.name(p.leader) + ' anula Al jugar del rival hasta el fin de su próximo turno.', [p.leader]);
        break;
      case 'imuCost': {
        const celestials = p.board.filter(card => traitsMatch(this.card(card), ['Celestial Dragons']));
        this.ask(task.side, 'Descarta una carta o sacrifica un Celestial Dragons', [...p.hand, ...celestials], card => {
          if (!card) cancel();
          else if (p.hand.includes(card)) this.discard(card);
          else this.move(card, 'trash');
        });
        break;
      }
      case 'recover': {
        const available = p.trash.filter(card => this.char(card) && this.card(card).cost <= task.maxCost && !nameMatches(this.card(card), [task.except]));
        this.ask(task.side, 'Elige qué carta recuperar del descarte', available, unit => {
          if (!unit) return;
          p.hand.push(omit(p.trash, unit));
          this.record('effect', this.name(unit) + ' vuelve a la mano.', [unit]);
        });
        break;
      }
      case 'restAll': for (const card of this.livingCharacters(enemy(task.side))) this.affect(card, { action: 'rest' }); break;
      case 'linlin': {
        const other = enemy(task.side);
        const options = [{ key: 'draw', label: 'Permitir que el jugador de Linlin robe dos cartas' }];
        if (this.players[other].hand.length >= 2) options.push({ key: 'discard', label: 'Descartar dos cartas propias' });
        this.ask(other, 'Charlotte Linlin · el defensor elige', options, choice => {
          if (choice?.key === 'discard') this.pickMany(other, 'Descarta dos cartas', () => this.players[other].hand, 2, card => this.discard(card));
          else this.draw(task.side, 2);
        }, { required: true });
        break;
      }
      case 'payRestOrTrash': {
        const targets = this.pickField({ ...task, action: 'freezeReady', rested: true });
        const options = (p.don.active ? [{ key: 'don', label: 'Descansar 1 DON!!' }] : [])
          .concat(p.hand.length ? [{ key: 'trash', label: 'Descartar una carta' }] : []);
        if (!targets.length) { cancel(); break; }
        this.ask(task.side, 'Elige el coste de la habilidad', options, choice => {
          if (!choice) return cancel();
          if (choice.key === 'don') { p.don.active--; p.don.rested++; }
          else this.pickMany(task.side, 'Elige qué carta descartar', () => p.hand, 1, card => this.discard(card), cancel);
        });
        break;
      }
      case 'bonney': {
        const other = this.players[enemy(task.side)];
        const options = [...other.board.filter(card => card.rested)];
        if (other.don.rested > other.don.frozenNext) options.push({ key: 'don', label: 'Un DON!! descansado' });
        this.ask(task.side, 'Elige qué no se refrescará', options, choice => {
          if (choice?.key === 'don') other.don.frozenNext++;
          else if (choice) this.affect(choice, { action: 'freezeReady' });
        });
        break;
      }
      case 'manual':
        p.stats.manual++;
        this.record('review', this.name(task.unit) + ' · resuelve el texto impreso en la mesa de efectos.');
        this.ask(task.side, 'Revisar efecto impreso de ' + this.name(task.unit), [{ key: 'printed', label: 'Ver carta', code: task.unit.code }],
          () => {}, { pass: 'Continuar', manual: true });
        break;
    }
  }

  manual(action, side, targetId, amount = 1, flag = '') {
    if (this.phase === 'mulligan' || this.result || ![0, 1].includes(side)) throw new Error('Inicia un duelo para ajustar la mesa.');
    if (this.pending && !this.pending.manual) throw new Error('Termina la elección del efecto en curso antes de ajustar la mesa.');
    const p = this.players[side];
    if (!Number.isInteger(amount) || Math.abs(amount) > 50000) throw new Error('La cantidad debe ser un número entero.');
    const applyTo = this.find(targetId);
    if (manualMoves.has(action)) {
      if (!applyTo) throw new Error('Selecciona un objetivo en el campo.');
      if ((this.isLeader(applyTo) || this.card(applyTo).kind === 'Stage') && ['ko', 'negateKO'].includes(action)) throw new Error('K.O. requiere un personaje.');
      if (this.isLeader(applyTo) && ['bounce', 'bottom', 'trash'].includes(action)) throw new Error('El líder permanece en su zona.');
      if (action === 'ko' || action === 'negateKO') {
        if (action === 'negateKO') applyTo.flags.negated = this.ply;
        this.move(applyTo, 'ko');
        this.queue(applyTo, 'ko', true);
      } else this.affect(applyTo, { action, amount, flag, side: applyTo.side });
    } else {
      switch (action) {
        case 'draw': this.draw(side, Math.min(10, Math.max(1, amount))); break;
        case 'add-don': this.gainDon(side, Math.min(10, Math.max(1, amount)), true); break;
        case 'ready-don': this.readyDon(side, Math.min(10, Math.max(1, amount))); break;
        case 'return-don':
          if (!this.returnDon(side, amount >= 1 && amount <= 10 ? amount : 1)) throw new Error('DON!! insuficiente.');
          break;
        case 'deck-life': this.runStep({ type: 'addLife', side }); break;
        case 'draw-life':
          if (p.life.length) p.hand.push(p.life.shift());
          break;
        case 'trash-life':
          if (p.life.length) p.trash.push(p.life.shift());
          break;
        case 'play-free': {
          const unit = p.hand.find(card => card.id === targetId && this.char(card));
          if (!unit || p.board.length >= 5) throw new Error('Elige un personaje en mano con un espacio disponible.');
          this.playCard(unit);
          break;
        }
        case 'discard': {
          const unit = p.hand.find(card => card.id === targetId);
          if (!unit) throw new Error('Elige una carta en la mano indicada.');
          this.discard(unit);
          break;
        }
        case 'recover': {
          const unit = p.trash.find(card => card.id === targetId);
          if (!unit) throw new Error('Elige una carta del descarte.');
          p.hand.push(omit(p.trash, unit));
          break;
        }
        default: throw new Error('Selecciona una acción de mesa.');
      }
    }
    this.record('review', 'Ajuste de práctica · ' + this.label(side) + ' · ' + (manualMoves.has(action) ? this.name(applyTo) : action) + '.');
    this.pump();
  }

  decisionSide() {
    return this.pending?.side ?? (['block', 'counter'].includes(this.phase) ? this.battle.defender.side : this.turn);
  }

  autoStep(side = this.decisionSide()) {
    if (this.result || this.decisionSide() !== side) return false;
    if (this.phase === 'mulligan') { this.start(false); return true; }
    if (this.pending) {
      if (this.pending.manual || !this.pending.items.length) return this.choose(-1);
      return this.choose(0);
    }
    if (this.phase === 'block') {
      const blocker = this.blockers().sort((a, b) => this.power(b) - this.power(a))[0];
      const used = blocker && this.isLeader(this.battle.defender) && this.power(this.battle.attacker) >= this.power(this.battle.defender);
      return this.block(used ? blocker.id : null);
    }
    if (this.phase === 'counter') {
      const missing = this.power(this.battle.attacker) - this.power(this.battle.defender) + 1;
      const available = this.counters().filter(card => this.counter(card) > 0);
      const counter = available.find(card => this.counter(card) >= missing) ?? available.sort((a, b) => this.counter(b) - this.counter(a))[0];
      const worth = missing > 0 && (this.isLeader(this.battle.defender) || this.card(this.battle.defender).cost >= 4) &&
        available.reduce((n, card) => n + this.counter(card), 0) >= missing;
      return counter && worth ? this.useCounter(counter.id) : this.resolveBattle();
    }
    if (!this.main(side)) {
      this.pump();
      return true;
    }
    const p = this.players[side];
    const play = p.hand.filter(unit => this.canPlay(unit) && this.card(unit).kind !== 'Event' && (p.board.length < 5 || !this.char(unit)))
      .sort((a, b) => this.card(b).cost - this.card(a).cost || this.power(b) - this.power(a))[0];
    if (play) return this.deploy(play.id, side);
    const activation = this.field(side).find(unit => !this.botActivated.has(unit.id) && this.canActivate(unit) &&
      !this.program(unit, 'activate').some(op => op.type === 'manual'));
    if (activation) {
      this.botActivated.add(activation.id);
      return this.activate(activation.id);
    }
    const attacker = this.field(side).filter(card => this.targets(card).length).sort((a, b) => this.power(b) - this.power(a))[0];
    if (attacker) {
      const all = this.targets(attacker);
      const selected = all.find(card => this.isLeader(card) && this.life(card.side) < 2) ??
        all.filter(card => !this.isLeader(card) && this.power(card) <= this.power(attacker)).sort((a, b) => this.power(b) - this.power(a))[0] ?? all[0];
      if (this.power(attacker) < this.power(selected) && p.don.active && !this.botAttaches.has(attacker.id)) {
        this.botAttaches.add(attacker.id);
        for (let i = 0, n = Math.min(p.don.active, Math.ceil((this.power(selected) - this.power(attacker)) / 1000)); i < n; i++) this.attach(attacker.id);
        return true;
      }
      if (this.power(attacker) >= this.power(selected)) return this.attack(attacker.id, selected.id);
    }
    return this.endTurn();
  }
}
