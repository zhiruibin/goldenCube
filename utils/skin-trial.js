/**
 * 皮肤试用：看完激励视频后，该分类可临时装备 3 天。
 * 不写入永久拥有。每个分类（方块 / 棋盘 / 音效 / 主题）同时只保留一条试用。
 * 到期后若仍装备着试用皮肤，恢复试用前的装备。
 */

const STORAGE_KEY = 'gc_skin_trial_v1';
const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
const TABS = ['block', 'board', 'sound', 'theme'];
const SOUND_RETIRED_KEY = 'gc_sound_shop_retired_v1';

function _read() {
    try {
        const raw = wx.getStorageSync(STORAGE_KEY);
        if (raw && typeof raw === 'object') return raw;
    } catch (e) { /* ignore */ }
    return {};
}

function _write(data) {
    try { wx.setStorageSync(STORAGE_KEY, data); } catch (e) { /* ignore */ }
}

function _equippedKey(tab) {
    return 'gc_equipped_' + tab;
}

function _readEquipped(tab) {
    try {
        return wx.getStorageSync(_equippedKey(tab)) || 'default';
    } catch (e) {
        return 'default';
    }
}

function _writeEquipped(tab, id) {
    try { wx.setStorageSync(_equippedKey(tab), id || 'default'); } catch (e) { /* ignore */ }
}

function _isOwned(skinId) {
    if (!skinId || skinId === 'default') return true;
    try {
        const owned = wx.getStorageSync('gc_ownedItems') || [];
        return owned.indexOf(skinId) >= 0;
    } catch (e) {
        return false;
    }
}

function _applySound(id) {
    try {
        const audio = (typeof GameGlobal !== 'undefined' && GameGlobal.game)
            ? GameGlobal.game.audioManager
            : null;
        if (audio && typeof audio.applySoundPack === 'function') audio.applySoundPack(id);
    } catch (e) { /* ignore */ }
}

function _slot(data, tab) {
    const slot = data && data[tab];
    if (!slot || !slot.skinId || typeof slot.expiresAt !== 'number') return null;
    return slot;
}

/** 未过期的试用；过期记录留给 settle 清理。 */
function getActive(tab) {
    const slot = _slot(_read(), tab);
    if (!slot || slot.expiresAt <= Date.now()) return null;
    return slot;
}

function isActive(tab, skinId) {
    const slot = getActive(tab);
    return !!(slot && slot.skinId === skinId);
}

function formatRemaining(ms) {
    const left = Number(ms) || 0;
    if (left <= 0) return '即将结束';
    const totalMin = Math.max(1, Math.ceil(left / 60000));
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return hours > 0 ? (days + '天' + hours + '时') : (days + '天');
    if (hours > 0) return mins > 0 ? (hours + '时' + mins + '分') : (hours + '时');
    return mins + '分';
}

/**
 * 清掉已到期或已永久获得的试用。
 * 到期且当前装备仍是试用皮肤时，恢复试用前的装备。
 */
function settle() {
    const data = _read();
    const now = Date.now();
    let changed = false;
    TABS.forEach((tab) => {
        const slot = _slot(data, tab);
        if (!slot) return;
        const owned = _isOwned(slot.skinId);
        const expired = slot.expiresAt <= now;
        if (!owned && !expired) return;
        if (!owned && expired && _readEquipped(tab) === slot.skinId) {
            const revert = slot.revertTo && slot.revertTo !== slot.skinId ? slot.revertTo : 'default';
            _writeEquipped(tab, revert);
            if (tab === 'sound') _applySound(revert);
        }
        delete data[tab];
        changed = true;
    });
    if (changed) _write(data);
}

/**
 * 从看完视频的时刻起算 3 天，并立刻装备。
 * 若本分类已有试用且正在使用，恢复目标沿用更早的装备，避免套娃。
 */
function startTrial(tab, skinId) {
    if (TABS.indexOf(tab) < 0 || !skinId) return null;
    settle();
    const data = _read();
    const prev = _slot(data, tab);
    const current = _readEquipped(tab);
    let revertTo = current;
    if (prev && prev.skinId === current && prev.revertTo && prev.revertTo !== skinId) {
        revertTo = prev.revertTo;
    }
    if (!revertTo || revertTo === skinId) revertTo = 'default';
    const slot = {
        skinId: skinId,
        expiresAt: Date.now() + TRIAL_MS,
        revertTo: revertTo,
    };
    data[tab] = slot;
    _write(data);
    _writeEquipped(tab, skinId);
    if (tab === 'sound') _applySound(skinId);
    return slot;
}

/** 音效页签去掉后，把已装备音效收回经典，并清掉音效试用。只做一次。 */
function retireSoundShopTab() {
    try {
        if (wx.getStorageSync(SOUND_RETIRED_KEY)) return;
        wx.setStorageSync('gc_equipped_sound', 'default');
        const data = _read();
        if (data.sound) {
            delete data.sound;
            _write(data);
        }
        wx.setStorageSync(SOUND_RETIRED_KEY, 1);
    } catch (e) { /* ignore */ }
    _applySound('default');
}

module.exports = {
    STORAGE_KEY,
    TRIAL_MS,
    getActive,
    isActive,
    formatRemaining,
    settle,
    startTrial,
    retireSoundShopTab,
};
