// tenantContext.js
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();

const getStore = () => als.getStore();
const runWith = (store, fn) => als.run(store, fn);

module.exports = { als, getStore, runWith };