/**
 * 皮肤试用：3 天起算、到期回退、同分类只留一条、永久获得后不再回退。
 * node tools/gc-test-skin-trial.js
 */
const store = {};
global.wx = {
    getStorageSync(key) { return store[key]; },
    setStorageSync(key, value) { store[key] = value; },
};
global.GameGlobal = { game: { audioManager: null } };

const trial = require('../utils/skin-trial');

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const now = Date.now();
const slot = trial.startTrial('block', 'neon');
assert(slot && slot.skinId === 'neon', 'start writes neon');
assert(store.gc_equipped_block === 'neon', 'trial equips immediately');
assert(slot.revertTo === 'default', 'revert target is previous equip');
assert(slot.expiresAt - now >= trial.TRIAL_MS - 1000, 'trial lasts 3 days');
assert(slot.expiresAt - now <= trial.TRIAL_MS + 1000, 'trial is not longer than 3 days');
assert(trial.isActive('block', 'neon'), 'neon is active');
assert(trial.formatRemaining(trial.TRIAL_MS).indexOf('天') >= 0, 'countdown includes days');

store.gc_equipped_block = 'neon';
const replaced = trial.startTrial('block', 'wood');
assert(replaced.skinId === 'wood', 'new trial replaces the category');
assert(replaced.revertTo === 'default', 'revert stays the pre-trial skin');
assert(!trial.isActive('block', 'neon'), 'previous trial is gone');
assert(store.gc_equipped_block === 'wood', 'new trial is equipped');

store[trial.STORAGE_KEY].block.expiresAt = Date.now() - 1000;
trial.settle();
assert(store.gc_equipped_block === 'default', 'expiry restores previous skin');
assert(trial.getActive('block') == null, 'expired trial is cleared');

trial.startTrial('sound', 'piano');
store.gc_ownedItems = ['piano'];
store.gc_equipped_sound = 'piano';
trial.settle();
assert(store.gc_equipped_sound === 'piano', 'owned trial is not reverted');
assert(trial.getActive('sound') == null, 'owned skin drops the trial record');

const themeTrial = trial.startTrial('theme', 'city');
assert(store.gc_equipped_theme === 'city', 'theme trial equips the city background');
assert(themeTrial.revertTo === 'default', 'theme trial restores the mine theme');
store[trial.STORAGE_KEY].theme.expiresAt = Date.now() - 1000;
trial.settle();
assert(store.gc_equipped_theme === 'default', 'expired theme returns to the mine theme');

console.log('PASS: skin trial');
