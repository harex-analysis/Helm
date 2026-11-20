import { readFile } from 'node:fs/promises';
import fengari from 'fengari';

const { lua, lauxlib, to_luastring, to_jsstring } = fengari;

function readValue(vm, index) {
  const type = lua.lua_type(vm, index);
  if (type === lua.LUA_TSTRING) return to_jsstring(lua.lua_tostring(vm, index));
  if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(vm, index);
  if (type !== lua.LUA_TTABLE) throw new Error('Tipo inválido en una secuencia de animación.');
  const table = Object.create(null);
  const position = lua.lua_absindex(vm, index);
  lua.lua_pushnil(vm);
  while (lua.lua_next(vm, position)) {
    const key = to_jsstring(lua.lua_tostring(vm, -2));
    table[key] = readValue(vm, -1);
    lua.lua_pop(vm, 1);
  }
  return table;
}

export async function loadMotion() {
  const source = await readFile(new URL('../motion.lua', import.meta.url), 'utf8');
  const vm = lauxlib.luaL_newstate();
  try {
    const loaded = lauxlib.luaL_loadstring(vm, to_luastring(source));
    if (loaded !== lua.LUA_OK || lua.lua_pcall(vm, 0, 1, 0) !== lua.LUA_OK) {
      throw new Error(to_jsstring(lua.lua_tostring(vm, -1)));
    }
    return readValue(vm, -1);
  } finally {
    lua.lua_close(vm);
  }
}
