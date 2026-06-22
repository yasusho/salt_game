// カード種別定義
const CARD_TYPES = {
    KOME: { id: 'kome', name: '米', val: 1, sortVal: 1, icon: '🌾', color: 'bg-amber-100/90 text-amber-800 shadow-md' },
    CHA:  { id: 'cha',  name: '茶', val: 2, sortVal: 2, icon: '🍵', color: 'bg-emerald-100/90 text-emerald-800 shadow-md' },
    NUNO: { id: 'nuno', name: '布', val: 3, sortVal: 3, icon: '🧵', color: 'bg-blue-100/90 text-blue-800 shadow-md' },
    NARA: { id: 'nara', name: 'ならず者', val: 5, sortVal: 5, icon: '🗡️', color: 'bg-slate-800 text-slate-100 shadow-md' }
};

// 納品カードプール定義
const NOHIN_CARD_POOL = [
    { pts: 1, req: { kome: 1 }, desc: "米 1" },
    { pts: 1, req: { cha: 1 }, desc: "茶 1" },
    { pts: 1, req: { kome: 2 }, desc: "米 2" },
    { pts: 1, req: { any: 1 }, desc: "任意 1" },
    { pts: 2, req: { nuno: 1 }, desc: "布 1" },
    { pts: 2, req: { kome: 1, cha: 1 }, desc: "米1 + 茶1" },
    { pts: 2, req: { cha: 2 }, desc: "茶 2" },
    { pts: 2, req: { kome: 3 }, desc: "米 3" },
    { pts: 2, req: { any: 2 }, desc: "任意 2" },
    { pts: 3, req: { nuno: 1, kome: 1 }, desc: "布1 + 米1" },
    { pts: 3, req: { nuno: 1, cha: 1 }, desc: "布1 + 茶1" },
    { pts: 3, req: { cha: 2, kome: 1 }, desc: "茶2 + 米1" },
    { pts: 3, req: { kome: 4 }, desc: "米 4" },
    { pts: 3, req: { sum: 6 }, desc: "合計値 6" },
    { pts: 5, req: { nuno: 2 }, desc: "布 2" },
    { pts: 5, req: { nuno: 1, cha: 2 }, desc: "布1 + 茶2" },
    { pts: 5, req: { nara: 1, any: 1 }, desc: "ならず者1 + 任意1" },
    { pts: 5, req: { any: 4 }, desc: "任意 4" }
];
