export const FAMILY_COLORS = [
    { name: '紫 (むらさき)', border: 'bg-purple-700', badge: 'bg-purple-50 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
    { name: '金茶 (きんちゃ)', border: 'bg-amber-600', badge: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    { name: '群青 (ぐんじょう)', border: 'bg-blue-800', badge: 'bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
    { name: '臙脂 (えんじ)', border: 'bg-rose-800', badge: 'bg-rose-50 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' },
    { name: '常磐 (ときわ)', border: 'bg-emerald-800', badge: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
    { name: '紺 (こん)', border: 'bg-indigo-900', badge: 'bg-indigo-50 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-300' },
    { name: '焦茶 (こげちゃ)', border: 'bg-stone-700', badge: 'bg-stone-50 text-stone-700 dark:bg-stone-900/40 dark:text-stone-300' },
    { name: '縹 (はなだ)', border: 'bg-cyan-800', badge: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' },
    { name: '茜 (あかね)', border: 'bg-red-800', badge: 'bg-red-50 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
    { name: '鶯 (うぐいす)', border: 'bg-lime-800', badge: 'bg-lime-50 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300' },
    { name: '鉄黒 (てつぐろ)', border: 'bg-slate-800', badge: 'bg-slate-50 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300' },
    { name: '蘇芳 (すおう)', border: 'bg-pink-800', badge: 'bg-pink-50 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300' },
];

export const getFamilyColorIndex = (familyName: string | undefined): number => {
    if (!familyName) return 0;
    let hash = 0;
    for (let i = 0; i < familyName.length; i++) {
        // 文字列ハッシュの分散を良くするため 31 ではなくより大きい素数を使用
        hash = familyName.charCodeAt(i) + ((hash << 5) - hash + (hash << 10));
    }
    return Math.abs(hash) % FAMILY_COLORS.length;
}
