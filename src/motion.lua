local function cue(ms, scale, rise, tilt, sparks, color, tone)
  return { ms = ms, scale = scale, rise = rise, tilt = tilt,
    sparks = sparks, color = color, tone = tone, stagger = ms * 0.06 }
end

local function riffle()
  local shuffle = cue(880, 1.12, 27, 34, 10, "#f3c16f", 247)
  for index = 1, 5 do
    local spread = (index - 3) * 0.58
    local distance = spread < 0 and -spread or spread
    shuffle["card" .. index] = {
      delay = -(index - 1) * shuffle.ms * 0.067,
      outerX = -50 + 90 * spread,
      outerY = -shuffle.rise + distance * 7,
      outerAngle = shuffle.tilt * spread,
      innerX = -50 - 32 * spread,
      innerY = shuffle.rise * 0.16,
      innerAngle = -13 * spread,
    }
  end
  return shuffle
end

return {
  route = cue(210, 1, 11, 0, 0, "#edd4a0", 0),
  insert = cue(390, 1.15, 18, -11, 13, "#ffcf7a", 392),
  remove = cue(260, 1.06, 12, 9, 6, "#f59592", 196),
  swap = cue(375, 1.09, 20, -8, 14, "#80dccd", 440),
  complete = cue(530, 1.2, 24, -9, 34, "#ffcf7a", 523),
  deal = cue(365, 1.08, 62, -13, 8, "#edd4a0", 294),
  draw = cue(300, 1.04, 37, -8, 4, "#eeb67a", 330),
  shuffle = riffle(),
  reveal = cue(470, 1.07, 16, -3, 21, "#f8c989", 466),
  deploy = cue(430, 1.23, 22, 0, 18, "#efc888", 392),
  attack = cue(370, 1.37, 15, -11, 19, "#ffb297", 185),
  block = cue(340, 1.15, 10, 0, 16, "#80def4", 554),
  impact = cue(345, 1.1, 15, -5, 18, "#ffa067", 146),
  ko = cue(440, 1.19, 21, -9, 23, "#f77877", 130),
  turn = cue(300, 1.03, 9, 0, 4, "#ffe6a5", 262),
  replay = cue(370, 1.09, 13, -2, 8, "#99dfcd", 330),
}
