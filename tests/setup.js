// Shim bcrypt with pure-JS stub for Linux sandbox (native .node binary is Windows-only)
// This file is only used in the sandbox via --require; it is NOT part of production code.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === 'bcrypt') {
    return {
      hash: (data, saltOrRounds) => Promise.resolve('$2b$10$shimmedHashForSandboxTests'),
      compare: (data, hash) => Promise.resolve(true),
      hashSync: (data, saltOrRounds) => '$2b$10$shimmedHashForSandboxTests',
      compareSync: (data, hash) => true,
      genSalt: (rounds) => Promise.resolve('$2b$10$shimmedSalt'),
      getRounds: () => 10,
    };
  }
  return origLoad.apply(this, arguments);
};
