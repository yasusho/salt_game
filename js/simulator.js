let simStats = null;
let simGamesCount = 0;
let simMaxGames = 0;
let simPlayerCount = 4;
let originalSound = null;

function startSimulationUI() {
    const count = parseInt(document.getElementById('sim-count').value);
    const playerCount = parseInt(document.getElementById('sim-player-count').value);
    
    document.getElementById('sim-progress').classList.remove('hidden');
    document.getElementById('sim-results').classList.add('hidden');
    document.getElementById('sim-current').innerText = "0";
    document.getElementById('sim-total').innerText = count;
    
    runSimulations(count, playerCount);
}

function runSimulations(count, playerCount = 4) {
    isSimulation = true;
    simMaxGames = count;
    simGamesCount = 0;
    simPlayerCount = playerCount;
    
    // シミュレーション実行ごとに初期化
    
    simStats = {
        games: 0,
        totalEscapes: 0,
        personalities: {}, // personality -> { gamesPlayed, wins, escapes, escapeScores: [], deathPositions: [] }
        startOrders: {} // order(0-indexed) -> { games:0, wins:0, escapes:0 }
    };
    
    originalSound = window.sound;
    window.sound = null;
    
    console.log(`Starting simulation: ${count} games with ${playerCount} players...`);
    runNextSimulation();
}

function runNextSimulation() {
    if (simGamesCount >= simMaxGames) {
        isSimulation = false;
        window.sound = originalSound;
        displaySimStats();
        return;
    }
    
    simGamesCount++;
    dispatch('INIT_GAME', { playerCount: simPlayerCount });
}

function recordSimulationStats() {
    simStats.games++;
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    
    // Determine winners (can be multiple if tied)
    let winnersList = [];
    if (winner && winner.escaped) {
        const topScore = winner.score;
        winnersList = sorted.filter(p => p.score === topScore && p.escaped);
    }
    
    state.players.forEach(p => {
        // AI以外（手動プレイヤー等）が混ざっていた場合は除外（シミュレーションでは全員AIだが念のため）
        if (!p.personality) return;
        
        // Initialize personality stats
        if (!simStats.personalities[p.personality]) {
            simStats.personalities[p.personality] = { gamesPlayed: 0, wins: 0, escapes: 0, escapeScores: [], deathPositions: [] };
        }
        
        // Initialize start order stats
        if (!simStats.startOrders[p.startOrder]) {
            simStats.startOrders[p.startOrder] = { games: 0, wins: 0, escapes: 0 };
        }
        
        const isWinner = winnersList.some(w => w.id === p.id);
        
        simStats.startOrders[p.startOrder].games++;
        simStats.personalities[p.personality].gamesPlayed++;
        
        if (isWinner) {
            simStats.personalities[p.personality].wins++;
            simStats.startOrders[p.startOrder].wins++;
        }
        
        if (p.escaped) {
            simStats.personalities[p.personality].escapes++;
            simStats.startOrders[p.startOrder].escapes++;
            simStats.personalities[p.personality].escapeScores.push(p.score);
            simStats.totalEscapes++;
        } else {
            simStats.personalities[p.personality].deathPositions.push(p.pos);
        }
    });
    
    // 毎ゲームごとにsetTimeoutを使ってコールスタックをリセットする
    if (simGamesCount % 10 === 0) {
        console.log(`Simulating game ${simGamesCount}...`);
        document.getElementById('sim-current').innerText = simGamesCount;
    }
    setTimeout(() => runNextSimulation(), 0);
}

function displaySimStats() {
    console.log("=== Simulation Results ===");
    
    // Render Dashboard UI using simStats
    const resultsContainer = document.getElementById('sim-results-content');
    resultsContainer.innerHTML = ""; // clear previous
    
    // サマリー計算
    const avgEscapes = (simStats.totalEscapes / simStats.games).toFixed(2);
    const totalEscapeRate = ((simStats.totalEscapes / (simStats.games * simPlayerCount)) * 100).toFixed(1);
    
    let html = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-white p-4 rounded shadow-sm border-l-4 border-indigo-500">
                <div class="text-xs text-slate-500 font-bold">総ゲーム数</div>
                <div class="text-2xl font-black text-slate-800">${simStats.games}<span class="text-sm font-normal ml-1">回</span></div>
            </div>
            <div class="bg-white p-4 rounded shadow-sm border-l-4 border-emerald-500">
                <div class="text-xs text-slate-500 font-bold">プレイ人数</div>
                <div class="text-2xl font-black text-slate-800">${simPlayerCount}<span class="text-sm font-normal ml-1">人</span></div>
            </div>
            <div class="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500">
                <div class="text-xs text-slate-500 font-bold">全体生還率</div>
                <div class="text-2xl font-black text-slate-800">${totalEscapeRate}<span class="text-sm font-normal ml-1">%</span></div>
            </div>
            <div class="bg-white p-4 rounded shadow-sm border-l-4 border-amber-500">
                <div class="text-xs text-slate-500 font-bold">1G平均生還者</div>
                <div class="text-2xl font-black text-slate-800">${avgEscapes}<span class="text-sm font-normal ml-1">人</span></div>
            </div>
        </div>
    `;

    // 手番別統計テーブル
    html += `
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2"><i data-lucide="list-ordered" class="w-5 h-5 text-indigo-600"></i> スタート手番別の統計</h3>
        <div class="overflow-x-auto mb-8 bg-white rounded shadow-sm">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider">
                        <th class="p-3 border-b">手番</th>
                        <th class="p-3 border-b text-right">勝率</th>
                        <th class="p-3 border-b text-right">生還率</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    for (let i = 0; i < simPlayerCount; i++) {
        const st = simStats.startOrders[i];
        if (!st) continue;
        const winRate = ((st.wins / st.games) * 100).toFixed(1);
        const escapeRate = ((st.escapes / st.games) * 100).toFixed(1);
        html += `
            <tr class="border-b last:border-0 hover:bg-slate-50 transition-colors">
                <td class="p-3 font-bold text-slate-700">${i + 1} 番手</td>
                <td class="p-3 text-right font-mono">${winRate}%</td>
                <td class="p-3 text-right font-mono text-slate-500">${escapeRate}%</td>
            </tr>
        `;
    }
    html += `</tbody></table></div>`;

    // 性格別成績テーブル
    html += `
        <h3 class="font-bold text-lg mb-3 flex items-center gap-2"><i data-lucide="brain" class="w-5 h-5 text-indigo-600"></i> 性格（プレイスタイル）別成績</h3>
        <p class="text-xs text-slate-500 mb-2">※毎ゲームランダムに性格が割り当てられ、全ゲームを通した合計勝率などを算出しています。</p>
        <div class="overflow-x-auto bg-white rounded shadow-sm">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider">
                        <th class="p-3 border-b">性格</th>
                        <th class="p-3 border-b text-right">勝率</th>
                        <th class="p-3 border-b text-right">生還率</th>
                        <th class="p-3 border-b text-right">スコア(平均/最大/最小)</th>
                        <th class="p-3 border-b text-right">死因(平均マス)</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    const personalities = Object.keys(simStats.personalities);
    personalities.sort((a, b) => {
        const aRate = simStats.personalities[a].wins / simStats.personalities[a].gamesPlayed;
        const bRate = simStats.personalities[b].wins / simStats.personalities[b].gamesPlayed;
        return bRate - aRate;
    });
    
    personalities.forEach(pName => {
        const pStat = simStats.personalities[pName];
        if (pStat.gamesPlayed === 0) return;
        
        const winRate = ((pStat.wins / pStat.gamesPlayed) * 100).toFixed(1);
        const escapeRate = ((pStat.escapes / pStat.gamesPlayed) * 100).toFixed(1);
        
        let scoreText = "-";
        if (pStat.escapeScores.length > 0) {
            const avgScore = (pStat.escapeScores.reduce((sum, s) => sum + s, 0) / pStat.escapeScores.length).toFixed(1);
            const maxScore = Math.max(...pStat.escapeScores);
            const minScore = Math.min(...pStat.escapeScores);
            scoreText = `${avgScore} / ${maxScore} / ${minScore}`;
        }
        
        let avgDeathPos = "-";
        if (pStat.deathPositions.length > 0) {
            avgDeathPos = (pStat.deathPositions.reduce((sum, pos) => sum + pos, 0) / pStat.deathPositions.length).toFixed(1) + " マス";
        }
        
        let displayLabel = pName;
        let styleClass = "";
        if (pName === 'aggressive') { displayLabel = '強気'; styleClass = 'bg-red-100 text-red-700 border-red-200'; }
        else if (pName === 'conservative') { displayLabel = '慎重'; styleClass = 'bg-blue-100 text-blue-700 border-blue-200'; }
        else if (pName === 'balanced') { displayLabel = '堅実'; styleClass = 'bg-emerald-100 text-emerald-700 border-emerald-200'; }
        
        // ハイライト (勝率トップ)
        const isTop = personalities[0] === pName;
        const rowClass = isTop ? "bg-amber-50" : "hover:bg-slate-50";
        
        html += `
            <tr class="border-b last:border-0 ${rowClass} transition-colors">
                <td class="p-3 font-bold">
                    <div class="inline-flex items-center gap-1.5 border px-2 py-1 rounded text-sm ${styleClass}">
                        ${isTop ? '<i data-lucide="crown" class="w-4 h-4 text-amber-500"></i>' : ''}${displayLabel}
                    </div>
                </td>
                <td class="p-3 text-right font-mono font-bold ${isTop ? 'text-amber-700' : 'text-indigo-600'}">${winRate}%</td>
                <td class="p-3 text-right font-mono text-slate-500">${escapeRate}%</td>
                <td class="p-3 text-right font-mono text-slate-500 text-sm">${scoreText}</td>
                <td class="p-3 text-right font-mono text-slate-400 text-xs">${avgDeathPos}</td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    
    resultsContainer.innerHTML = html;
    if(window.lucide) lucide.createIcons();
    
    document.getElementById('sim-progress').classList.add('hidden');
    document.getElementById('sim-results').classList.remove('hidden');
}
