// カード種別定義
const CARD_TYPES = {
    KOME: { id: 'kome', name: '米', val: 1, sortVal: 1, icon: '🌾', color: 'bg-amber-100/90 text-amber-800 shadow-md' },
    CHA:  { id: 'cha',  name: '茶', val: 2, sortVal: 2, icon: '🍵', color: 'bg-emerald-100/90 text-emerald-800 shadow-md' },
    NUNO: { id: 'nuno', name: '布', val: 3, sortVal: 3, icon: '🧵', color: 'bg-blue-100/90 text-blue-800 shadow-md' },
    NARA: { id: 'nara', name: 'ならず者', val: 5, sortVal: 5, icon: '🗡️', color: 'bg-slate-800 text-slate-100 shadow-md' },
    SALT1: { id: 'salt1', name: '岩塩', val: 1, sortVal: 6, icon: '🧂', color: 'bg-white/90 text-slate-700 shadow-md border-2 border-slate-300' },
    SALT2: { id: 'salt2', name: '藻塩', val: 2, sortVal: 7, icon: '🧂', color: 'bg-white/90 text-slate-700 shadow-md border-2 border-blue-300' },
    SALT3: { id: 'salt3', name: '精製塩', val: 3, sortVal: 8, icon: '🧂', color: 'bg-white/90 text-slate-700 shadow-md border-2 border-indigo-400' },
    SALT5: { id: 'salt5', name: '献上塩', val: 3, sortVal: 9, icon: '🧂', color: 'bg-white/90 text-slate-700 shadow-md border-2 border-amber-400' }
};

// 納品カードプール定義
const NOHIN_CARD_POOL = [
    { id: 'salt1', val: 1, pts: 2, req: { kome: 1 }, desc: "米 1" },
    { id: 'salt1', val: 1, pts: 3, req: { cha: 1 }, desc: "茶 1" },
    { id: 'salt1', val: 1, pts: 3, req: { kome: 2 }, desc: "米 2" },
    { id: 'salt1', val: 1, pts: 2, req: { any: 1 }, desc: "任意 1" },
    { id: 'salt2', val: 2, pts: 5, req: { nuno: 1 }, desc: "布 1" },
    { id: 'salt2', val: 2, pts: 5, req: { kome: 1, cha: 1 }, desc: "米1 + 茶1" },
    { id: 'salt2', val: 2, pts: 6, req: { cha: 2 }, desc: "茶 2" },
    { id: 'salt2', val: 2, pts: 5, req: { kome: 3 }, desc: "米 3" },
    { id: 'salt2', val: 2, pts: 4, req: { any: 2 }, desc: "任意 2" },
    { id: 'salt3', val: 2, pts: 8, req: { nuno: 1, kome: 1 }, desc: "布1 + 米1" },
    { id: 'salt3', val: 3, pts: 10, req: { nuno: 1, cha: 1 }, desc: "布1 + 茶1" },
    { id: 'salt3', val: 3, pts: 10, req: { cha: 2, kome: 1 }, desc: "茶2 + 米1" },
    { id: 'salt3', val: 2, pts: 8, req: { kome: 4 }, desc: "米 4" },
    { id: 'salt3', val: 3, pts: 12, req: { sum: 6 }, desc: "合計値 6" },
    { id: 'salt5', val: 3, pts: 15, req: { nuno: 2 }, desc: "布 2" },
    { id: 'salt5', val: 3, pts: 18, req: { nuno: 1, cha: 2 }, desc: "布1 + 茶2" },
    { id: 'salt5', val: 3, pts: 16, req: { nara: 1, any: 1 }, desc: "ならず者1 + 任意1" },
    { id: 'salt5', val: 3, pts: 15, req: { any: 4 }, desc: "任意 4" }
];
