// --- 状態 (State) ---
let isSimulation = false;
let state = {
    players: [],
    road: [],
    deck: [],
    nohinPool: [],
    nohinDeck: [],
    currentPhase: 0,
    roundCounter: 0,
    activePlayerIdx: 0,
    drawnCards: [],
    outwardSubPhase: "",
    selectedDropCards: [],
    droppedThisBurst: [],
    discardPile: [],
    passedPlayers: [],
    boughtThisTurn: false,
    plotCards: {},
    wildDecisions: {},
    turnOrder: [],
    currentTurnIndex: 0,
    actionMessage: "",
    actionMessageIsAlert: false
};

class Player {
    constructor(id, name, isAI) {
        this.id = id;
        this.name = name;
        this.isAI = isAI;
        this.hand = [];       
        this.nohin = [];      
        this.pos = 0;        
        this.alive = true;    
        this.escaped = false; 
        this.startOrder = id;
        this.personality = 'balanced';
    }
    get score() { return this.nohin.reduce((sum, card) => sum + card.pts, 0); }
    getCardCounts() {
        const counts = { kome: 0, cha: 0, nuno: 0, nara: 0 };
        this.hand.forEach(c => {
            if (c.id === 'kome') counts.kome++;
            else if (c.id === 'cha') counts.cha++;
            else if (c.id === 'nuno') counts.nuno++;
            else if (c.id === 'nara') counts.nara++;
        });
        return counts;
    }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getCardStyle(id) { return CARD_TYPES[id.toUpperCase()]; }
function calcCurrentSum(cards) { return Math.max(0, cards.reduce((s, c) => s + c.val, 0)); }

// --- ユーティリティ ---
function log(message, type = "info") {
    if (isSimulation) return;
    const logBox = document.getElementById("game-log");
    const p = document.createElement("p");
    if (type === "system") p.className = "text-indigo-600 font-bold mt-1";
    else if (type === "warn") p.className = "text-rose-500 font-bold";
    else if (type === "success") p.className = "text-emerald-500 font-bold";
    else if (type === "p1") p.className = "text-slate-800 font-medium";
    else if (type === "ai") p.className = "text-slate-500";
    else p.className = "text-slate-600";
    p.innerHTML = message;
    logBox.appendChild(p);
    logBox.scrollTop = logBox.scrollHeight;
}

function clearLog() {
    if (isSimulation) return;
    document.getElementById("game-log").innerHTML = "";
}

function delayDispatch(action, ms) {
    if (isSimulation) dispatch(action);
    else setTimeout(() => dispatch(action), ms);
}

// --- ロジックコア: Reducer/DSL Dispatcher ---
function dispatch(action, payload) {
    // Replicate actions over P2P connection
    if (p2pMode && p2pConn && p2pConn.open) {
        const playerActions = ['HIT_CARD', 'STAND', 'PLACE_DROP', 'BUY_DRAFT', 'PASS_DRAFT', 'SUBMIT_DISCARD'];
        if (playerActions.includes(action)) {
            let activePlayer = state.players[state.activePlayerIdx];
            if (action === 'SUBMIT_DISCARD' && payload && payload.player) {
                activePlayer = payload.player;
            }
            if (activePlayer) {
                let isMyControl = false;
                if (p2pRole === 'host') {
                    isMyControl = (activePlayer.name === "あなた" || activePlayer.isAI);
                } else {
                    isMyControl = (activePlayer.name === "あなた");
                }
                
                if (isMyControl) {
                    p2pConn.send({ type: 'ACTION', action: action, payload: payload });
                }
            }
        }
    }

    switch (action) {
        case 'INIT_GAME': {
            const playerCount = (payload && payload.playerCount) ? payload.playerCount : 4;
            const allCandidates = [
                new Player(0, "あなた", false),
                new Player(1, "オコジョ", true),
                new Player(2, "カモシカ", true),
                new Player(3, "ツキノワ", true),
                new Player(4, "ホンドギツネ", true)
            ];
            
            if (p2pMode) {
                // In P2P, player 1 (Okojo slot) becomes human (isAI: false)
                allCandidates[1].isAI = false;
                if (p2pRole === 'host') {
                    allCandidates[1].name = "対戦相手";
                } else {
                    allCandidates[0].name = "対戦相手";
                }
            }

            // Player 0 (あなた) is always included, plus playerCount-1 AIs
            state.players = [allCandidates[0]];
            for (let i = 1; i < playerCount; i++) {
                state.players.push(allCandidates[i]);
            }

            const personalities = ['aggressive', 'conservative', 'balanced'];
            const colors = ["bg-blue-500", "bg-orange-400", "bg-emerald-400", "bg-purple-400", "bg-rose-400"];
            shuffle(state.players);
            let aiCount = 1;
            state.players.forEach((p, idx) => {
                p.startOrder = idx; p.id = idx;
                p.isAI = (p.name !== "あなた" && p.name !== "対戦相手");
                if (isSimulation) {
                    p.isAI = true;
                    p.name = `bot${idx + 1}`;
                } else {
                    if (p.isAI) {
                        p.name = `bot${aiCount++}`;
                    }
                }
                if (p2pMode && p2pRole === 'host' && p.name === "あなた") {
                    p2pMyPlayerIdx = p.id;
                }
                
                // AIに毎ゲームランダムな性格を割り当てる
                if (p.isAI) {
                    p.personality = personalities[Math.floor(Math.random() * personalities.length)];
                }

                p.pos = 13;
                p.colorClass = colors[idx % colors.length];
            });
            state.road = Array(14).fill().map(() => ({ faceUp: null, faceDown: [] }));
            state.deck = []; state.nohinPool = []; state.nohinDeck = [];
            state.currentPhase = 1; state.roundCounter = 0; state.activePlayerIdx = 0;
            state.drawnCards = []; state.outwardSubPhase = "draw"; state.discardPile = []; state.passedPlayers = [];
            state.plotCards = {}; state.wildDecisions = {}; state.turnOrder = []; state.currentTurnIndex = 0;

            for (let i = 0; i < 22; i++) state.deck.push({ ...CARD_TYPES.KOME });
            for (let i = 0; i < 16; i++) state.deck.push({ ...CARD_TYPES.CHA });
            for (let i = 0; i < 10; i++) state.deck.push({ ...CARD_TYPES.NUNO });
            for (let i = 0; i < 12; i++) state.deck.push({ ...CARD_TYPES.NARA });
            shuffle(state.deck);

            for (let i = 1; i <= 12; i++) state.road[i].faceUp = state.deck.pop();

            state.nohinDeck = JSON.parse(JSON.stringify(NOHIN_CARD_POOL));
            shuffle(state.nohinDeck);
            for (let i = 0; i < 5; i++) if (state.nohinDeck.length > 0) state.nohinPool.push(state.nohinDeck.pop());

            clearLog();
            log("<b>【第1フェイズ：往路】</b>", "system");
            log("街道に12枚のカードが配置されました。");
            log("全3ラウンド。積載限界は「10」。11以上でバーストとなります。");
            
            // Host broadcasts state to Guest
            if (p2pMode && p2pRole === 'host' && p2pConn && p2pConn.open) {
                p2pConn.send({
                    type: 'SYNC_INIT',
                    state: {
                        deck: state.deck,
                        nohinDeck: state.nohinDeck,
                        nohinPool: state.nohinPool,
                        road: state.road,
                        currentPhase: state.currentPhase,
                        roundCounter: state.roundCounter,
                        activePlayerIdx: state.activePlayerIdx,
                        outwardSubPhase: state.outwardSubPhase,
                        passedPlayers: state.passedPlayers,
                        players: state.players.map(p => ({
                            id: p.id,
                            name: p.name,
                            isAI: p.isAI,
                            hand: p.hand,
                            nohin: p.nohin,
                            pos: p.pos,
                            alive: p.alive,
                            escaped: p.escaped,
                            startOrder: p.startOrder,
                            colorClass: p.colorClass
                        })),
                        turnOrder: state.turnOrder.map(p => ({ id: p.id }))
                    }
                });
            }

            startActivePlayerTurn();
            break;
        }
        case 'HIT_CARD': {
            const p = state.players[state.activePlayerIdx];
            const card = drawCard();
            if (!card) {
                log("山札も捨札もありません。", "warn");
                dispatch('STAND');
                return;
            }
            state.drawnCards.push(card);
            const sum = calcCurrentSum(state.drawnCards);
            log(`めくったカード: ${card.icon} ${card.name}(値: ${card.val}) ➔ [合計: ${sum}]`, !p.isAI ? "p1" : "ai");

            if (sum >= 11) {
                if(window.sound) sound.burst();
                log("💥 <b>バースト！</b>", "warn");
                triggerScreenEffect('burst');
                if (!p.isAI) {
                    state.outwardSubPhase = "burst_select_2";
                    state.selectedDropCards = [];
                    state.droppedThisBurst = [];
                    if (p2pMode && p.id !== p2pMyPlayerIdx) {
                        state.actionMessage = `対戦相手がバースト処理中...`; state.actionMessageIsAlert = true;
                    } else {
                        showBurstDropUI();
                    }
                } else {
                    state.actionMessage = `${p.name} がバーストしました。`; state.actionMessageIsAlert = true;
                    renderAll();
                    delayDispatch('AI_BURST_HANDLE', 1200);
                }
            } else {
                if (!p.isAI) {
                    if (p2pMode && p.id !== p2pMyPlayerIdx) {
                        state.actionMessage = `対戦相手が考え中... [合計:${sum}]`;
                        state.actionMessageIsAlert = false;
                    } else {
                        state.actionMessage = `[合計:${sum}] 完了して手札にするか、さらにめくりますか？`;
                        state.actionMessageIsAlert = false;
                    }
                } else {
                    delayDispatch('AI_DECIDE_DRAW', 1000);
                }
            }
            break;
        }
        case 'STAND': {
            const p = state.players[state.activePlayerIdx];
            if(window.sound) sound.stand();
            
            // ボーナスとして1枚追加で引く
            const bonusCard = drawCard();
            if (bonusCard) {
                state.drawnCards.push(bonusCard);
                log(`🎁 ストップボーナス：山札から追加で1枚引きました（${bonusCard.icon}）。ここから設置する1枚を選びます。`, "system");
            }
            
            if (p.isAI) {
                if (state.drawnCards.length > 0) {
                    const idx = Math.floor(Math.random() * state.drawnCards.length);
                    const card = state.drawnCards.splice(idx, 1)[0];
                    const pos = Math.floor(Math.random() * 12) + 1;
                    state.road[pos].faceDown.push(card);
                    log(`マス${pos}にカードを設置しました。`, "ai");
                }
                log(`完了。残り${state.drawnCards.length}枚を手札に加えました。`, "ai");
                state.drawnCards.forEach(c => p.hand.push(c));
                state.drawnCards = [];
                dispatch('END_TURN');
                return;
            }

            if (state.drawnCards.length <= 1) {
                log(`1枚以下のため、手札に加えられるカードはありません（全て場に設置されます）。`);
                state.selectedDropCards = [...state.drawnCards];
                state.droppedThisBurst = [];
                state.outwardSubPhase = "stand_select_place";
                if (p2pMode && p.id !== p2pMyPlayerIdx) {
                    state.actionMessage = `対戦相手が設置場所を選んでいます...`; state.actionMessageIsAlert = true;
                } else {
                    state.actionMessage = `<b>【ステップ 2/2】</b> 設置するマスを、下の「街道の状況」からタップして選んでください。`; state.actionMessageIsAlert = true;
                }
            } else {
                state.selectedDropCards = [];
                state.droppedThisBurst = [];
                state.outwardSubPhase = "stand_select_1";
                if (p2pMode && p.id !== p2pMyPlayerIdx) {
                    state.actionMessage = `対戦相手が設置カードを選んでいます...`; state.actionMessageIsAlert = true;
                } else {
                    state.actionMessage = `<b>【ステップ 1/2】</b> 街道に残す（設置する）カードを、下の「めくったカード」からタップして選んでください。`; state.actionMessageIsAlert = true;
                }
            }
            break;
        }
        case 'SELECT_DROP_CARD': {
            state.selectedDropCards = [payload.card];
            const p = state.players[state.activePlayerIdx];
            if (state.outwardSubPhase === "burst_select_2") {
                const dropNum = state.droppedThisBurst.length + 1;
                if (p2pMode && p.id !== p2pMyPlayerIdx) {
                    state.actionMessage = `対戦相手が設置場所を選んでいます（${dropNum}枚目）...`; state.actionMessageIsAlert = true;
                } else {
                    state.actionMessage = `<b>【ステップ 2/2】</b> 選択したカードを落とすマスを、下の「街道の状況」からタップして選んでください（${dropNum}枚目）。`; state.actionMessageIsAlert = true;
                }
                state.outwardSubPhase = "burst_select_place";
            } else if (state.outwardSubPhase === "stand_select_1") {
                if (p2pMode && p.id !== p2pMyPlayerIdx) {
                    state.actionMessage = `対戦相手が設置場所を選んでいます...`; state.actionMessageIsAlert = true;
                } else {
                    state.actionMessage = `<b>【ステップ 2/2】</b> 選択したカードを設置するマスを、下の「街道の状況」からタップして選んでください。`; state.actionMessageIsAlert = true;
                }
                state.outwardSubPhase = "stand_select_place";
            }
            break;
        }
        case 'PLACE_DROP': {
            const pos = payload.pos;
            if (state.selectedDropCards.length === 0) return;
            const card = state.selectedDropCards.shift();
            state.droppedThisBurst.push(card);
            state.road[pos].faceDown.push(card);
            log(`マス${pos}にカードを設置しました。`);
            
            const idx = state.drawnCards.indexOf(card);
            if (idx > -1) state.drawnCards.splice(idx, 1);

            if (state.outwardSubPhase === "stand_select_place") {
                const p = state.players[state.activePlayerIdx];
                log(`完了。残り${state.drawnCards.length}枚を手札に加えました。`, !p.isAI ? "p1" : "ai");
                state.drawnCards.forEach(c => p.hand.push(c));
                state.drawnCards = [];
                dispatch('END_TURN');
                return;
            }

            const targetDrops = Math.min(2, state.droppedThisBurst.length + state.drawnCards.length + state.selectedDropCards.length);
            if (state.droppedThisBurst.length < targetDrops) {
                if (state.drawnCards.length <= 1) {
                    state.selectedDropCards = [state.drawnCards[0]];
                    if (p2pMode && state.players[state.activePlayerIdx].id !== p2pMyPlayerIdx) {
                        state.actionMessage = `対戦相手が2枚目の落とすマスを選んでいます...`; state.actionMessageIsAlert = true;
                    } else {
                        state.actionMessage = `<b>【ステップ 2/2】</b> 2枚目を落とすマスを、下の「街道の状況」からタップして選んでください。`; state.actionMessageIsAlert = true;
                    }
                    state.outwardSubPhase = "burst_select_place";
                } else {
                    state.selectedDropCards = [];
                    state.outwardSubPhase = "burst_select_2";
                    if (p2pMode && state.players[state.activePlayerIdx].id !== p2pMyPlayerIdx) {
                        state.actionMessage = `対戦相手が2枚目の落とすカードを選んでいます...`; state.actionMessageIsAlert = true;
                    } else {
                        state.actionMessage = `<b>【ステップ 1/2】</b> 2枚目の落とすカードを、下の「めくったカード」からタップして選んでください。`; state.actionMessageIsAlert = true;
                    }
                }
            } else {
                state.actionMessage = "";
                state.drawnCards.forEach(c => state.discardPile.push(c));
                state.drawnCards = []; 
                
                const p = state.players[state.activePlayerIdx];
                log(`💥 バーストの救済として「ならず者（ワイルド）」を1枚獲得しました。`, "success");
                if(window.sound) sound.coin();
                p.hand.push({ ...CARD_TYPES.NARA });
                
                dispatch('END_TURN');
                return;
            }
            break;
        }
        case 'END_TURN': {
            state.activePlayerIdx = (state.activePlayerIdx + 1) % state.players.length;
            if (state.activePlayerIdx === 0) state.roundCounter++;

            if (state.roundCounter >= 3) {
                log("<b>【第2フェイズ：中間】</b>", "system");
                log("塩の取引を行います。");
                state.currentPhase = 2;
                state.passedPlayers = [];
                
                let activeCandidates = [...state.players];
                activeCandidates.sort((a, b) => {
                    if (a.hand.length !== b.hand.length) return a.hand.length - b.hand.length;
                    return Math.random() - 0.5;
                });
                let firstPlayer = activeCandidates[0];
                state.turnOrder = [];
                const numPlayers = state.players.length;
                for (let i = 0; i < numPlayers; i++) {
                    let id = (firstPlayer.id + i) % numPlayers;
                    state.turnOrder.push(state.players.find(p => p.id === id));
                }
                state.currentTurnIndex = 0;
                
                dispatch('NEXT_DRAFT_TURN');
                return;
            } else {
                startActivePlayerTurn();
            }
            break;
        }
        case 'NEXT_DRAFT_TURN': {
            if (state.passedPlayers.length >= state.players.length) {
                dispatch('START_PHASE3');
                return;
            }
            
            let found = false;
            let startIndex = state.currentTurnIndex;
            const numPlayers = state.players.length;
            for (let i = 0; i < numPlayers; i++) {
                let p = state.turnOrder[(startIndex + i) % numPlayers];
                if (!state.passedPlayers.includes(p.id)) {
                    state.currentTurnIndex = (startIndex + i) % numPlayers;
                    state.activePlayerIdx = p.id;
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                dispatch('START_PHASE3');
                return;
            }

            state.boughtThisTurn = false;

            const p = state.players[state.activePlayerIdx];
            log(`>>> <b>${p.name}</b> の取引 (手札: ${p.hand.length}枚)`);

            if (p.isAI) {
                state.actionMessage = `${p.name} が取引を検討中...`; state.actionMessageIsAlert = false;
                if (!(p2pMode && p2pRole === 'guest')) {
                    delayDispatch('AI_DRAFT', 1000);
                }
            } else {
                if (p2pMode && p.id !== p2pMyPlayerIdx) {
                    state.actionMessage = `対戦相手の取引を待っています...`; state.actionMessageIsAlert = false;
                } else {
                    state.actionMessage = `マーケットから塩を買うか、パスしてください。`; state.actionMessageIsAlert = false;
                }
            }
            break;
        }
        case 'BUY_DRAFT': {
            const idx = payload.idx;
            const p = state.players[state.activePlayerIdx];
            const card = state.nohinPool[idx];
            
            payCostFromHand(p, card.req);
            p.nohin.push(card);
            log(`塩 [${card.pts}pt] を購入しました。`);
            
            if (state.nohinDeck.length > 0) {
                state.nohinPool[idx] = state.nohinDeck.pop();
            } else {
                state.nohinPool.splice(idx, 1);
            }
            state.boughtThisTurn = true;
            state.currentTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
            dispatch('NEXT_DRAFT_TURN');
            return;
        }
        case 'PASS_DRAFT': {
            state.passedPlayers.push(state.activePlayerIdx);
            log(`${state.players[state.activePlayerIdx].name} 取引終了。`);
            state.currentTurnIndex = (state.currentTurnIndex + 1) % state.players.length;
            dispatch('NEXT_DRAFT_TURN');
            return;
        }
        case 'START_PHASE3': {
            state.currentPhase = 3;
            log("<b>【第3フェイズ：復路】</b>", "system");
            log("全員13マス目から0マス目へのサバイバルレース開始！");
            state.players.forEach(p => p.pos = 13);
            dispatch('START_PLOT');
            return;
        }
        case 'START_PLOT': {
            state.plotCards = {}; state.wildDecisions = {};
            if (p2pMode) p2pPlots.reset();
            let aliveCount = 0;
            state.players.forEach(p => {
                if (p.alive && !p.escaped) {
                    if (p.hand.length === 0 && p.nohin.length === 0) {
                        p.alive = false;
                        log(`💀 ${p.name} 行き倒れ（脱落）`, "warn");
                    } else aliveCount++;
                }
            });
            if (aliveCount === 0) {
                dispatch('END_GAME');
                return;
            }

            let myPlayer = null;
            if (p2pMode) {
                myPlayer = state.players.find(p => p.id === p2pMyPlayerIdx && p.alive && !p.escaped);
            } else {
                myPlayer = state.players.find(p => !p.isAI && p.alive && !p.escaped);
            }

            if (myPlayer) {
                state.actionMessage = `移動プロット：進むカードを選んでください。`; state.actionMessageIsAlert = false;
                openPlotModal(myPlayer);
            } else {
                const anyAlive = state.players.some(p => p.alive && !p.escaped);
                if (anyAlive && p2pMode) {
                    state.actionMessage = `対戦相手のプロットを待っています...`; state.actionMessageIsAlert = false;
                } else {
                    state.actionMessage = `解決中...`; state.actionMessageIsAlert = false;
                }
            }
            
            state.players.forEach(p => {
                if (p.isAI && p.alive && !p.escaped) {
                    if (p2pMode && p2pRole === 'guest') {
                        return; // Guest waits for Host's AI plays
                    }
                    
                    let chosenCardIdx = -1;
                    let useNohin = false;
                    const distance = p.pos;
                    const sortedHand = p.hand.map((c, idx) => ({ card: c, originalIdx: idx })).sort((a, b) => a.card.val - b.card.val);
                    const sortedNohin = p.nohin.map((c, idx) => ({ card: c, originalIdx: idx })).sort((a, b) => a.card.val - b.card.val);

                    let reachingCard = sortedHand.find(item => {
                        let val = item.card.val;
                        if (item.card.id === 'nara') val = 5;
                        return val >= distance;
                    });
                    
                    if (!reachingCard) {
                        reachingCard = sortedNohin.find(item => item.card.val >= distance);
                        if (reachingCard) useNohin = true;
                    }

                    if (reachingCard) {
                        chosenCardIdx = reachingCard.originalIdx;
                    }

                    if (chosenCardIdx === -1) {
                        for (let item of sortedHand) {
                            let val = item.card.val;
                            if (item.card.id === 'nara') val = 3;
                            
                            const targetPos = p.pos - val;
                            if (targetPos > 0 && targetPos < 13) {
                                const targetCell = state.road[targetPos];
                                if (targetCell.faceDown.length > 0) {
                                    chosenCardIdx = item.originalIdx;
                                    break;
                                }
                            }
                        }
                    }

                    if (chosenCardIdx === -1) {
                        for (let item of sortedNohin) {
                            const targetPos = p.pos - item.card.val;
                            if (targetPos > 0 && targetPos < 13) {
                                const targetCell = state.road[targetPos];
                                if (targetCell.faceDown.length > 0) {
                                    chosenCardIdx = item.originalIdx;
                                    useNohin = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (chosenCardIdx === -1) {
                        if (p.hand.length > 0) {
                            if (p.personality === 'aggressive') {
                                // 強気：常に最大のカードを出して急ぐ
                                chosenCardIdx = sortedHand[sortedHand.length - 1].originalIdx;
                            } else if (p.personality === 'conservative') {
                                // 慎重：常に最小のカードを出して様子を見る
                                chosenCardIdx = sortedHand[0].originalIdx;
                            } else {
                                // 堅実：手札枚数に応じて使い分ける
                                if (p.hand.length <= 3) {
                                    chosenCardIdx = sortedHand[0].originalIdx;
                                } else {
                                    chosenCardIdx = sortedHand[sortedHand.length - 1].originalIdx;
                                }
                            }
                        } else {
                            chosenCardIdx = sortedNohin[0].originalIdx;
                            useNohin = true;
                        }
                    }

                    const played = useNohin ? p.nohin.splice(chosenCardIdx, 1)[0] : p.hand.splice(chosenCardIdx, 1)[0];
                    if (useNohin) log(`${p.name} が特典（塩）を身代わりに移動しました`, "ai");
                    state.plotCards[p.id] = played;
                    
                    if (played.id === 'nara') {
                        let bestStep = 5;
                        if (distance <= 5) {
                            bestStep = distance;
                        } else {
                            const steps = [5, 3, 2, 1];
                            for (let step of steps) {
                                const targetPos = p.pos - step;
                                if (targetPos > 0 && state.road[targetPos].faceDown.length > 0) {
                                    bestStep = step;
                                    break;
                                }
                            }
                        }
                        state.wildDecisions[p.id] = bestStep;
                    }
                    
                    // Host broadcasts AI secret
                    if (p2pMode && p2pRole === 'host') {
                        p2pConn.send({ type: 'PLOT_SECRET', playerId: p.id });
                    }
                }
            });
            
            if (p2pMode) {
                checkP2PPlotsReady();
            } else {
                dispatch('CHECK_ALL_PLOTTED');
            }
            return;
        }
        case 'SUBMIT_PLOT': {
            const player = payload.player;
            const c = payload.card;
            let played = null;
            let idx = player.hand.findIndex(hc => hc.id === c.id);
            if (idx !== -1) {
                played = player.hand.splice(idx, 1)[0];
            } else {
                idx = player.nohin.findIndex(nc => nc.id === c.id);
                if (idx !== -1) played = player.nohin.splice(idx, 1)[0];
            }
            state.plotCards[player.id] = played;
            
            if (played.id === 'nara') {
                openWildModal(player);
            } else {
                if (p2pMode && player.id === p2pMyPlayerIdx) {
                    p2pPlots.myCard = played;
                    p2pPlots.myWild = null;
                    p2pConn.send({ type: 'PLOT_SECRET', playerId: p2pMyPlayerIdx });
                    checkP2PPlotsReady();
                } else {
                    dispatch('CHECK_ALL_PLOTTED');
                }
            }
            return;
        }
        case 'SUBMIT_WILD': {
            state.wildDecisions[payload.player.id] = payload.step;
            if (p2pMode && payload.player.id === p2pMyPlayerIdx) {
                p2pPlots.myCard = state.plotCards[p2pMyPlayerIdx];
                p2pPlots.myWild = payload.step;
                p2pConn.send({ type: 'PLOT_SECRET', playerId: p2pMyPlayerIdx });
                checkP2PPlotsReady();
            } else {
                dispatch('CHECK_ALL_PLOTTED');
            }
            return;
        }
        case 'CHECK_ALL_PLOTTED': {
            let allReady = true;
            state.players.forEach(p => {
                if (p.alive && !p.escaped) {
                    if (!state.plotCards[p.id]) allReady = false;
                    if (state.plotCards[p.id] && state.plotCards[p.id].id === 'nara' && !state.wildDecisions[p.id]) allReady = false;
                }
            });
            if (allReady) {
                state.actionMessage = `一斉解決します。`; state.actionMessageIsAlert = false;
                renderAll();
                delayDispatch('RESOLVE_PLOTS', 800);
                return;
            }
            break;
        }
        case 'RESOLVE_PLOTS': {
            log("--- 移動公開 ---", "system");
            let activePlayers = state.players.filter(p => p.alive && !p.escaped);
            activePlayers.sort((a, b) => {
                const ca = state.plotCards[a.id];
                const cb = state.plotCards[b.id];
                const caSort = ca.sortVal || getCardStyle(ca.id).sortVal;
                const cbSort = cb.sortVal || getCardStyle(cb.id).sortVal;
                if (caSort !== cbSort) return cbSort - caSort; 
                if (a.pos !== b.pos) return b.pos - a.pos; 
                return Math.random() - 0.5;
            });
            state.turnOrder = activePlayers;
            
            // EXECUTE_MOVE will now handle all players simultaneously
            state.resolvingSpaces = null;
            dispatch('EXECUTE_MOVE');
            return;
        }
        case 'EXECUTE_MOVE': {
            if (!state.resolvingSpaces) {
                // First step: Move all players simultaneously
                state.turnOrder.forEach(p => {
                    if (p.alive && !p.escaped) {
                        const c = state.plotCards[p.id];
                        let steps = c.val;
                        if (c.id === 'nara') steps = state.wildDecisions[p.id];
                        p.pos = Math.max(0, p.pos - steps);
                        log(`🏃 ${p.name} -> マス[${p.pos}]`, p.isAI ? "ai" : "p1");
                    }
                });
                if(window.sound) sound.step();
                
                // Identify spaces to resolve (from goal to start: 1 to 12)
                const occupied = new Set();
                state.turnOrder.forEach(p => {
                    if (p.alive && !p.escaped && p.pos > 0) occupied.add(p.pos);
                });
                state.resolvingSpaces = Array.from(occupied).sort((a,b) => a - b);
                
                renderAll();
                delayDispatch('RESOLVE_NEXT_SPACE', 1000);
                return;
            }
        }
        case 'RESOLVE_NEXT_SPACE': {
            if (!state.resolvingSpaces || state.resolvingSpaces.length === 0) {
                // Done resolving spaces. Check escapes.
                state.turnOrder.forEach(p => {
                    if (p.alive && !p.escaped && p.pos === 0) {
                        p.escaped = true;
                        log(`🎉 ${p.name} 生還！`, "success");
                    }
                });
                state.resolvingSpaces = null;
                renderAll();
                delayDispatch('START_PLOT', 1000);
                return;
            }

            const pos = state.resolvingSpaces.shift();
            const playersAtPos = state.turnOrder.filter(p => p.alive && !p.escaped && p.pos === pos);

            if (playersAtPos.length === 0) {
                dispatch('RESOLVE_NEXT_SPACE');
                return;
            }

            let targetCard = null;
            if (state.road[pos].faceUp) {
                targetCard = state.road[pos].faceUp;
                state.road[pos].faceUp = null;
            } else if (state.road[pos].faceDown.length > 0) {
                targetCard = state.road[pos].faceDown.pop();
            }

            if (targetCard) {
                log(`マス[${pos}] のカードは [${getCardStyle(targetCard.id).name}] でした！`);
                
                // 即座に補充判定を行う
                if (!state.road[pos].faceUp && state.road[pos].faceDown.length === 0) {
                    const replCard = drawCard();
                    if (replCard) {
                        state.road[pos].faceDown.push(replCard);
                        log(`マス[${pos}]が空いたため、山札から裏向きで1枚補充されました。`, "system");
                    }
                }

                if (targetCard.id === 'nara') {
                    log(`💥 ならず者の罠！ 同じマスにいる全員が被害を受けます！`, "warn");
                    if(window.sound) sound.explosion();
                    triggerScreenEffect('nara');
                    state.discardPile.push(targetCard);
                    
                    state.trapVictims = [...playersAtPos];
                    dispatch('PROCESS_TRAP_VICTIM');
                    return;
                } else {
                    if (playersAtPos.length === 1) {
                        const p = playersAtPos[0];
                        log(`${p.name} が特産品を獲得！`, "success");
                        if(window.sound) sound.coin();
                        p.hand.push(targetCard);
                    } else {
                        log(`💥 バッティング！ 複数人が狙ったため資源は散逸しました。`, "warn");
                        state.discardPile.push(targetCard);
                    }
                }
            }
            
            renderAll();
            delayDispatch('RESOLVE_NEXT_SPACE', 1000);
            return;
        }
        case 'PROCESS_TRAP_VICTIM': {
            if (!state.trapVictims || state.trapVictims.length === 0) {
                renderAll();
                delayDispatch('RESOLVE_NEXT_SPACE', 1000);
                return;
            }

            const p = state.trapVictims[0]; // peek
            if (!p.isAI) {
                if (p2pMode && p.id !== p2pMyPlayerIdx) {
                    state.actionMessage = `対戦相手が罠の処理中...`; state.actionMessageIsAlert = true;
                    return;
                }
                state.actionMessage = `罠を踏みました！ 身代わりを1枚捨ててください。`; state.actionMessageIsAlert = true;
                state.pendingDiscards = 1;
                openDiscardModal(p);
                return; // stops loop until user answers
            } else {
                for (let i = 0; i < 1; i++) {
                    if (p.hand.length > 0) {
                        p.hand.sort((a,b) => a.val - b.val);
                        const lost = p.hand.shift();
                        state.discardPile.push(lost);
                        log(`${p.name} は ${lost.name} を捨てた。`, "ai");
                    } else if (p.nohin.length > 0) {
                        p.nohin.sort((a,b) => a.val - b.val);
                        const lost = p.nohin.shift();
                        state.discardPile.push(lost);
                        log(`${p.name} は 特典の ${getCardStyle(lost.id).name} を捨てた。`, "ai");
                    }
                }
                state.trapVictims.shift();
                dispatch('PROCESS_TRAP_VICTIM');
                return;
            }
        }
        case 'SUBMIT_DISCARD': {
            const { player, card } = payload;
            let idx = player.hand.findIndex(hc => hc.id === card.id);
            if (idx !== -1) {
                const c = player.hand.splice(idx, 1)[0];
                state.discardPile.push(c);
            } else {
                idx = player.nohin.findIndex(nc => nc.id === card.id);
                if (idx !== -1) {
                    const c = player.nohin.splice(idx, 1)[0];
                    state.discardPile.push(c);
                }
            }
            log(`[${getCardStyle(card.id).name}] を捨てました。`, "p1");
            
            if (state.pendingDiscards) state.pendingDiscards--;
            
            if (state.pendingDiscards > 0 && (player.hand.length > 0 || player.nohin.length > 0)) {
                state.actionMessage = `残り ${state.pendingDiscards} 枚捨ててください。`; state.actionMessageIsAlert = true;
                openDiscardModal(player);
                return;
            }
            
            state.pendingDiscards = 0;
            state.actionMessage = `解決中...`; state.actionMessageIsAlert = false;
            if (state.trapVictims && state.trapVictims.length > 0) state.trapVictims.shift();
            dispatch('PROCESS_TRAP_VICTIM');
            return;
        }
        case 'END_GAME': {
            if (isSimulation) {
                recordSimulationStats();
                return;
            }
            state.currentPhase = 4;
            state.actionMessage = `ゲーム終了`; state.actionMessageIsAlert = false;
            log("<b>ゲーム終了</b>", "system");
            if(window.sound) sound.fanfare();
            
            const listDiv = document.getElementById("result-list");
            listDiv.innerHTML = "";
            [...state.players].sort((a, b) => {
                if(a.escaped && !b.escaped) return -1;
                if(!a.escaped && b.escaped) return 1;
                return b.score - a.score;
            }).forEach(p => {
                const el = document.createElement("div");
                el.className = "flex justify-between items-center bg-slate-50 p-3 rounded-md border border-slate-100";
                let status = p.escaped ? `<span class="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-xs">生還 ${p.score}pt</span>` : `<span class="text-rose-500 font-bold bg-rose-50 px-2 py-0.5 rounded-full text-xs">行き倒れ</span>`;
                el.innerHTML = `<span class="text-sm font-bold text-slate-700">${p.name}</span> ${status}`;
                listDiv.appendChild(el);
            });
            document.getElementById("result-modal").classList.remove("hidden");
            break;
        }
        
        // --- AI Handlers ---
        case 'AI_DECIDE_DRAW': {
            const sum = calcCurrentSum(state.drawnCards);
            const p = state.players[state.activePlayerIdx];
            if (state.drawnCards.length >= 5) { dispatch('STAND'); return; }
            
            // Calculate remaining cards to compute exact probability of bursting
            const allRemainingCards = [...state.deck, ...state.discardPile];
            const totalRemaining = allRemainingCards.length;
            
            let willHit = false;
            if (totalRemaining === 0) {
                willHit = false; // standard fallback
            } else {
                let bustCardsCount = 0;
                allRemainingCards.forEach(c => {
                    if (sum + c.val >= 11) {
                        bustCardsCount++;
                    }
                });
                const probOfBust = bustCardsCount / totalRemaining;
                
                // Set threshold based on current hand size and round counter
                let maxAcceptableBustProb = 0.25; // 25% acceptable risk
                if (p.hand.length < 3) {
                    maxAcceptableBustProb = 0.45; // Take more risk to get cards
                } else if (p.hand.length >= 6) {
                    maxAcceptableBustProb = 0.10; // Already have enough, play safe
                }
                
                // Round 3 is the last chance to draft cards, take more risk if desperate
                if (state.roundCounter === 2 && p.hand.length < 4) {
                    maxAcceptableBustProb = 0.60;
                }
                
                // Apply personality modifiers
                if (p.personality === 'aggressive') {
                    maxAcceptableBustProb += 0.10; // 強気でも自滅しすぎない程度のリスク(+10%)
                } else if (p.personality === 'conservative') {
                    maxAcceptableBustProb -= 0.15; // 極めて安全第一(-15%)
                }
                
                willHit = probOfBust <= maxAcceptableBustProb;
            }

            if (willHit) { if(window.sound) sound.draw(); dispatch('HIT_CARD'); }
            else dispatch('STAND');
            return;
        }
        case 'AI_BURST_HANDLE': {
            const p = state.players[state.activePlayerIdx];
            let drops = [];
            if (state.drawnCards.length <= 2) drops = [...state.drawnCards];
            else { shuffle(state.drawnCards); drops = [state.drawnCards[0], state.drawnCards[1]]; }
            
            drops.forEach(c => {
                let pos;
                if (c.id === 'nara') {
                    if (p.personality === 'aggressive') {
                        // 強気：ゴール手前の嫌な位置(8〜11)に置く
                        pos = Math.floor(Math.random() * 4) + 8;
                    } else if (p.personality === 'conservative') {
                        // 慎重：自分が踏むリスクを減らすため遠く(10〜12)か序盤(1〜3)
                        pos = Math.random() < 0.5 ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 3) + 10;
                    } else {
                        // 堅実：人がよく踏む中央(4〜10)
                        pos = Math.floor(Math.random() * 7) + 4;
                    }
                } else {
                    if (p.personality === 'conservative') {
                        // 慎重：確実にとれるように浅い位置(2,4)に置く
                        const goodSpots = [2, 4];
                        pos = goodSpots[Math.floor(Math.random() * goodSpots.length)];
                    } else {
                        const goodSpots = [2, 4, 6, 8, 10, 12];
                        pos = goodSpots[Math.floor(Math.random() * goodSpots.length)];
                    }
                }
                pos = Math.max(1, Math.min(12, pos));
                state.road[pos].faceDown.push(c);
                log(`マス${pos}に落とし物をしました。`, "ai");
            });
            state.drawnCards.forEach(c => { if (!drops.includes(c)) state.discardPile.push(c); });
            state.drawnCards = [];
            
            log(`💥 バーストの救済として「ならず者（ワイルド）」を1枚獲得しました。`, "ai");
            p.hand.push({ ...CARD_TYPES.NARA });
            
            renderAll();
            delayDispatch('END_TURN', 1000);
            return;
        }
        case 'AI_DRAFT': {
            const p = state.players[state.activePlayerIdx];
            let buyable = [];
            state.nohinPool.forEach((c, idx) => { if (canAfford(p, c)) buyable.push({card: c, idx: idx}); });

            if (buyable.length > 0) {
                // 性格によるソート
                if (p.personality === 'conservative') {
                    // 慎重：移動手札を残すため、なるべく安い（点数の低い）塩を好む
                    buyable.sort((a,b) => a.card.pts - b.card.pts);
                } else {
                    // 強気・堅実：点数の高い塩を優先
                    buyable.sort((a,b) => b.card.pts - a.card.pts);
                }
                
                // Smarter check: Make sure buying doesn't leave the AI bankrupt on return.
                let selectedTarget = null;
                for (let i = 0; i < buyable.length; i++) {
                    const target = buyable[i];
                    
                    // Estimate cost in card count
                    let estimatedCost = 0;
                    if (target.card.req.kome) estimatedCost += target.card.req.kome;
                    if (target.card.req.cha) estimatedCost += target.card.req.cha;
                    if (target.card.req.nuno) estimatedCost += target.card.req.nuno;
                    if (target.card.req.any) estimatedCost += target.card.req.any;
                    if (target.card.req.sum) estimatedCost += 2; // Sum 6 is usually 2 or 3 cards
                    
                    const remainingHandCount = p.hand.length - estimatedCost;
                    
                    let minCardsToKeep = 2;
                    if (p.personality === 'aggressive') minCardsToKeep = 1; // 強気でも最低1枚は残す（0枚は即死するため）
                    if (p.personality === 'conservative') minCardsToKeep = 4; // 慎重は手札をたっぷり残す
                    
                    // まだ塩を1つも持っていない場合は妥協して買うが、絶対に「残り1枚」は死守する
                    const isDesperate = (p.nohin.length === 0 && remainingHandCount >= 1);
                    
                    if (remainingHandCount >= minCardsToKeep || isDesperate) {
                        selectedTarget = target;
                        break;
                    }
                }

                if (selectedTarget) {
                    const target = selectedTarget;
                    state.nohinPool.splice(target.idx, 1);
                    payCostFromHand(p, target.card.req);
                    p.nohin.push(target.card);
                    log(`${p.name} が 塩 [${target.card.pts}pt] を購入。`, "ai");
                    if (state.nohinDeck.length > 0) state.nohinPool.push(state.nohinDeck.pop());
                    renderAll();
                    delayDispatch('NEXT_DRAFT_TURN', 800);
                    return;
                }
            }
            dispatch('PASS_DRAFT');
            return;
        }
    }
    renderAll();
}

// --- ユーティリティ (純粋なロジック関数) ---
function drawCard() {
    if (state.deck.length === 0) {
        if (state.discardPile.length === 0) return null;
        state.deck = state.discardPile; state.discardPile = []; shuffle(state.deck);
        log("🔄 山札をリシャッフルしました。", "system");
    }
    return state.deck.pop();
}

function startActivePlayerTurn() {
    state.drawnCards = [];
    state.outwardSubPhase = "draw";
    state.selectedDropCards = [];
    
    const p = state.players[state.activePlayerIdx];
    log(`--- <b>${p.name}</b> のターン (${state.roundCounter + 1}/3) ---`, !p.isAI ? "p1" : "ai");

    if (p.isAI) {
        state.actionMessage = `${p.name} が考え中...`; state.actionMessageIsAlert = false;
        renderAll();
        if (!(p2pMode && p2pRole === 'guest')) {
            delayDispatch('AI_DECIDE_DRAW', 800);
        }
    } else {
        state.actionMessage = `あなたのターン：カードをめくりますか？`; state.actionMessageIsAlert = false;
    }
}

function showBurstDropUI() {
    state.selectedDropCards = []; state.droppedThisBurst = [];
    if (state.drawnCards.length <= 2) {
        log(`2枚以下のため全て落とし物になります。`);
        state.selectedDropCards = [state.drawnCards[0]];
        state.actionMessage = `<b>【ステップ 2/2】</b> 1枚目を落とすマスを、下の「街道の状況」からタップして選んでください。`; state.actionMessageIsAlert = true;
        state.outwardSubPhase = "burst_select_place";
    } else {
        state.actionMessage = `<b>【ステップ 1/2】</b> 1枚目の落とすカードを、下の「めくったカード」からタップして選んでください。`; state.actionMessageIsAlert = true;
        state.outwardSubPhase = "burst_select_2";
    }
}

function getPossiblePayments(player, req) {
    const counts = player.getCardCounts();
    let naras = counts.nara;
    let neededKome = req.kome || 0; let neededCha = req.cha || 0; let neededNuno = req.nuno || 0; let neededAny = req.any || 0; let neededSum = req.sum || 0;
    if (neededSum > 0) return findSum6Combinations(player.hand);
    let costKome = Math.max(0, neededKome - counts.kome); let costCha = Math.max(0, neededCha - counts.cha); let costNuno = Math.max(0, neededNuno - counts.nuno);
    let remKome = Math.max(0, counts.kome - neededKome); let remCha = Math.max(0, counts.cha - neededCha); let remNuno = Math.max(0, counts.nuno - neededNuno);
    if (naras < costKome + costCha + costNuno) return null;
    naras -= (costKome + costCha + costNuno);
    if ((remKome + remCha + remNuno + naras) < neededAny) return null;
    return true; 
}

function findSum6Combinations(hand) {
    let dp = new Set([0]);
    for(let c of hand) {
        let nextSums = new Set(dp);
        for(let s of dp) nextSums.add(s + c.val);
        dp = nextSums;
    }
    return dp.has(6) ? true : null;
}

function canAfford(player, card) { return getPossiblePayments(player, card.req) !== null; }

function payCostFromHand(player, req) {
    let hand = player.hand; let removeCards = [];
    if (req.sum === 6) {
        let paths = { 0: [] };
        for(let i=0; i<hand.length; i++) {
            let c = hand[i]; let nextPaths = { ...paths };
            for(let sStr in paths) {
                let s = parseInt(sStr); let nextS = s + c.val;
                if(!nextPaths[nextS]) nextPaths[nextS] = [...paths[s], i];
            }
            paths = nextPaths; if(paths[6]) break;
        }
        if (paths[6]) {
            paths[6].sort((a,b)=>b-a).forEach(idx => {
                const used = hand.splice(idx, 1)[0]; removeCards.push(used); state.discardPile.push(used); 
            });
        }
        return removeCards;
    }
    const pull = (type, count) => {
        for(let i=0; i<count; i++) {
            let idx = hand.findIndex(c => c.id === type);
            if (idx !== -1) { const c = hand.splice(idx, 1)[0]; removeCards.push(c); state.discardPile.push(c); }
            else {
                let nIdx = hand.findIndex(c => c.id === 'nara');
                if (nIdx !== -1) { const c = hand.splice(nIdx, 1)[0]; removeCards.push(c); state.discardPile.push(c); }
            }
        }
    };
    pull('nara', req.nara || 0); pull('kome', req.kome || 0); pull('cha', req.cha || 0); pull('nuno', req.nuno || 0);
    for(let i=0; i< (req.any || 0); i++) {
        for(let t of ['kome', 'cha', 'nuno', 'nara']) {
            let idx = hand.findIndex(c => c.id === t);
            if(idx !== -1) { const c = hand.splice(idx, 1)[0]; removeCards.push(c); state.discardPile.push(c); break; }
        }
    }
    return removeCards;
}


// --- レンダリング (UI描画) ---
function renderAll() {
    if (isSimulation) return;
    updateActionMessageUI();
    updatePlayerStatus();
    updateRoadView();
    updateNohinPool();
    updateTempDrawArea();
    updateControlButtons();
}

function updateActionMessageUI() {
    if (isSimulation) return;
    const el = document.getElementById("action-message");
    if (!state.actionMessage) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden"); el.innerHTML = state.actionMessage;
    if (state.actionMessageIsAlert) el.className = "text-center bg-rose-500 text-white py-1.5 px-4 rounded text-xs font-bold mx-auto shadow-sm shadow-rose-500/20 animate-pulse";
    else el.className = "text-center bg-slate-800 text-white py-1.5 px-4 rounded text-xs font-medium mx-auto shadow-sm";
}

function updatePlayerStatus() {
    if(state.players.length === 0) return;
    const container = document.getElementById("player-status-container");
    if (!container) return;
    container.innerHTML = "";

    state.players.forEach((p) => {
        const card = document.createElement("div");
        card.id = `player-card-${p.id}`;
        card.className = "p-3 rounded bg-slate-50 transition-all relative";
        
        // Highlight active player
        if (p.id === state.activePlayerIdx && state.currentPhase !== 0 && state.currentPhase !== 4 && state.currentPhase !== 3) {
            card.classList.add("ring-2", "ring-indigo-500", "scale-[1.02]", "shadow-md");
        }

        let statusText = "待機中";
        let statusClass = "text-[10px] font-medium text-slate-400";
        if (!p.alive) {
            statusText = "脱落";
            statusClass = "text-[10px] font-bold text-rose-500";
        } else if (p.escaped) {
            statusText = "生還";
            statusClass = "text-[10px] font-bold text-emerald-500";
        } else if (state.currentPhase === 1) {
            statusText = `往路 (${state.roundCounter + 1}/3)`;
            statusClass = "text-[10px] font-medium text-slate-500";
        } else if (state.currentPhase === 2) {
            if (state.passedPlayers.includes(p.id)) {
                statusText = "離脱";
                statusClass = "text-[10px] font-medium text-slate-300";
            } else {
                statusText = "取引中";
                statusClass = "text-[10px] font-bold text-indigo-500";
            }
        } else if (state.currentPhase === 3) {
            statusText = `マス [${p.pos}]`;
            statusClass = "text-[10px] font-medium text-blue-500";
        }

        const maxScore = Math.max(...state.players.map(pl => pl.score));
        const isLeader = maxScore > 0 && p.score === maxScore;
        const crownClass = isLeader ? "" : "hidden";

        card.innerHTML = `
            <div class="flex justify-between items-center mb-1.5">
                <div class="font-bold text-xs flex items-center gap-1.5 text-slate-800">
                    <span class="w-2 h-2 rounded-full ${p.colorClass}"></span>${p.name}
                </div>
                <span id="p${p.id}-crown" class="${crownClass} text-amber-400"><i data-lucide="crown" class="w-3.5 h-3.5 fill-current"></i></span>
            </div>
            <div id="p${p.id}-hand" class="flex flex-wrap gap-0.5 mb-1.5 min-h-[30px]"></div>
            <div class="flex justify-between items-end">
                <span id="p${p.id}-status" class="${statusClass}">${statusText}</span>
                <span class="font-bold text-slate-700 text-sm"><span id="p${p.id}-nohin">${p.score}</span><span class="text-[9px] font-bold text-slate-400 ml-0.5">点</span></span>
            </div>
        `;
        container.appendChild(card);

        // Render hand mini cards
        const handDiv = document.getElementById(`p${p.id}-hand`);
        if (p.hand.length === 0) {
            handDiv.innerHTML = `<span class="text-[10px] text-slate-300 font-medium flex items-center h-full">手札なし</span>`;
        } else {
            p.hand.slice().sort((a,b)=>a.val-b.val).forEach(c => {
                const el = document.createElement("div");
                let isMe = false;
                if (p2pMode) isMe = (p.id === p2pMyPlayerIdx);
                else isMe = !p.isAI;
                
                if (!isMe) {
                    el.className = `hand-card-mini bg-slate-800 rounded-sm`;
                    el.innerHTML = ``;
                } else {
                    const style = getCardStyle(c.id);
                    el.className = `hand-card-mini ${style.color}`;
                    el.innerHTML = `<span title="${style.name}" class="text-[11px]">${style.icon}</span>`;
                }
                handDiv.appendChild(el);
            });
        }
    });

    document.getElementById("deck-count-display").innerText = `山札 ${state.deck.length}`;
    
    let phaseText = "開始前";
    if (state.currentPhase === 1) phaseText = "往路フェイズ（資源集め）";
    if (state.currentPhase === 2) phaseText = "中間フェイズ（塩の取引）";
    if (state.currentPhase === 3) phaseText = "復路フェイズ（サバイバル）";
    if (state.currentPhase === 4) phaseText = "対戦終了";

    const phaseDot = state.currentPhase === 1 ? 'bg-amber-500' : state.currentPhase === 2 ? 'bg-indigo-500' : state.currentPhase === 3 ? 'bg-emerald-500' : 'bg-slate-400';
    document.getElementById("current-phase-display").innerHTML = `<div class="w-2 h-2 ${phaseDot} rounded-full"></div><span>${phaseText}</span>`;
    if(window.lucide) lucide.createIcons();
}

function updateNohinPool() {
    const container = document.getElementById("nohin-container");
    container.innerHTML = "";
    if(state.players.length === 0) return;
    
    state.nohinPool.forEach((card, idx) => {
        const p = state.players[state.activePlayerIdx];
        const isMyTurn = (state.currentPhase === 2 && !p.isAI && (!p2pMode || p.id === p2pMyPlayerIdx));
        const canAffordCard = canAfford(p, card);
        const canInteract = isMyTurn && canAffordCard;

        const el = document.createElement("button");
        el.disabled = !canInteract;
        el.onclick = () => { if(window.sound) sound.click(); dispatch('BUY_DRAFT', {idx}); };
        
        el.className = `flex-col rounded flex items-center justify-between p-2 text-center transition-all min-h-[85px] w-full shadow-sm ${canInteract ? 'bg-amber-50 hover:bg-amber-100 hover:shadow-md cursor-pointer' : 'bg-slate-50 opacity-60'}`;

        let reqHtml = "";
        if (card.req.sum) {
            reqHtml = `<div class="hand-card-mini bg-slate-100 text-slate-700 font-bold w-auto px-1.5">合計${card.req.sum}</div>`;
        } else {
            const iconMap = { kome: '🌾', cha: '🍵', nuno: '🧵', nara: '🗡️', any: '❔' };
            let htmlParts = [];
            for (let key in card.req) {
                if (iconMap[key]) {
                    let count = card.req[key];
                    let cardClass = key === 'nara' ? 'bg-slate-700 text-white' :
                                    key === 'kome' ? 'bg-amber-100 text-amber-800' :
                                    key === 'cha'  ? 'bg-emerald-100 text-emerald-800' :
                                    key === 'nuno' ? 'bg-blue-100 text-blue-800' :
                                    'bg-slate-100 text-slate-600';
                    for(let i=0; i<count; i++) htmlParts.push(`<div class="hand-card-mini ${cardClass}"><span class="text-[11px]">${iconMap[key]}</span></div>`);
                }
            }
            reqHtml = htmlParts.join("");
        }
        el.innerHTML = `
            <div class="w-full flex flex-col items-center">
                <span class="text-[9px] font-bold text-slate-500 block leading-none mb-1.5">必要資源</span>
                <div class="flex items-center justify-center flex-wrap gap-0.5">${reqHtml}</div>
            </div>
            <div class="leading-none mt-2 flex justify-center items-baseline gap-2 text-slate-800 w-full">
                <div><span class="text-lg font-bold">${card.pts}</span><span class="text-[10px] font-bold">点</span></div>
                <div class="text-slate-500"><span class="text-sm font-bold">${card.val}</span><span class="text-[9px] font-bold">歩</span></div>
            </div>`;
        container.appendChild(el);
    });
}

function updateRoadView() {
    const grid = document.getElementById("road-grid");
    grid.innerHTML = "";
    if(state.players.length === 0) return;

    const p = state.players[state.activePlayerIdx];
    const isDropping = (state.currentPhase === 1 && !p.isAI && (!p2pMode || p.id === p2pMyPlayerIdx) && (state.outwardSubPhase === "burst_select_place" || state.outwardSubPhase === "stand_select_place"));

    const boardContainer = document.getElementById("road-board-container");
    if (boardContainer) {
        if (isDropping) {
            boardContainer.className = "bg-indigo-50/50 rounded p-5 shadow-lg transition-all ring-4 ring-indigo-500/20";
            const mapTitle = boardContainer.querySelector(".tracking-widest");
            if (mapTitle && !mapTitle.innerHTML.includes("👉")) {
                mapTitle.innerHTML = `<i data-lucide="map" class="w-4 h-4 text-indigo-650 animate-bounce"></i> <span class="text-indigo-700 font-black">👉 設置するマス（1〜12のいずれか）をタップしてください</span>`;
            }
        } else {
            boardContainer.className = "bg-white rounded p-5 shadow-md transition-all";
            const mapTitle = boardContainer.querySelector(".tracking-widest");
            if (mapTitle) {
                mapTitle.innerHTML = `<i data-lucide="map" class="w-4 h-4"></i> 街道の状況`;
            }
        }
    }

    for (let i = 0; i <= 13; i++) {
        const cellData = state.road[i];
        const standingPlayers = state.players.filter(pl => pl.alive && !pl.escaped && pl.pos === i);
        
        const cellEl = document.createElement("div");
        cellEl.className = "flex-shrink-0 w-[60px] h-[85px] relative flex items-center justify-center rounded transition-all shadow-sm ";
        
        if (isDropping && i > 0 && i < 13) {
            cellEl.classList.add("cursor-pointer", "bg-indigo-200/90", "ring-4", "ring-indigo-400/50", "shadow-lg", "scale-105", "animate-pulse");
            cellEl.onclick = () => dispatch('PLACE_DROP', {pos: i});
        } else {
            cellEl.classList.add("bg-slate-100/50");
            if(i === 0) cellEl.classList.add("bg-emerald-100/70");
            if(i === 13) cellEl.classList.add("bg-blue-100/70");
        }

        const numEl = document.createElement("div");
        numEl.className = "absolute top-1 right-1 text-[9px] text-slate-400 font-bold z-20";
        numEl.innerText = i === 0 ? "0" : i === 13 ? "13" : i;
        cellEl.appendChild(numEl);

        if (cellData.faceUp) {
            const style = getCardStyle(cellData.faceUp.id);
            const faceUpEl = document.createElement("div");
            faceUpEl.className = `absolute inset-1 rounded flex flex-col items-center justify-center bg-white shadow-md`;
            faceUpEl.innerHTML = `<span class="text-2xl">${style.icon}</span>`;
            cellEl.appendChild(faceUpEl);
        }
        if (cellData.faceDown.length > 0) {
            const cardBack = document.createElement("div");
            cardBack.className = "w-10 h-14 bg-slate-800 rounded text-white flex flex-col justify-center items-center relative z-10 shadow-md";
            cardBack.innerHTML = `<i data-lucide="package" class="w-4 h-4 opacity-70"></i><span class="absolute bottom-1 right-1 text-[8px] font-bold text-slate-350">x${cellData.faceDown.length}</span>`;
            cellEl.appendChild(cardBack);
        } else if (isDropping && i > 0 && i < 13) {
            const dropHint = document.createElement("div");
            dropHint.className = "text-indigo-655 opacity-90 z-10 animate-bounce";
            dropHint.innerHTML = `<i data-lucide="arrow-down" class="w-5 h-5"></i>`;
            cellEl.appendChild(dropHint);
        }
        if (standingPlayers.length > 0) {
            const tokenContainer = document.createElement("div");
            tokenContainer.className = "absolute -bottom-2.5 left-0 right-0 flex justify-center gap-1 z-30 scale-[0.85]";
            standingPlayers.forEach(pl => {
                let color = pl.colorClass;
                const tok = document.createElement("span");
                tok.className = `w-6 h-6 rounded-full ${color} border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm`;
                tok.innerText = pl.name.substring(0,1);
                tokenContainer.appendChild(tok);
            });
            cellEl.appendChild(tokenContainer);
        }
        grid.appendChild(cellEl);
    }
    if(window.lucide) lucide.createIcons();
}

function updateTempDrawArea() {
    const tempArea = document.getElementById("temp-draw-area");
    const tempCardsDiv = document.getElementById("temp-cards");
    tempCardsDiv.innerHTML = "";
    
    if (state.currentPhase !== 1 || (state.drawnCards.length === 0 && state.outwardSubPhase !== "draw")) {
        tempArea.classList.add("hidden");
        return;
    } else {
        tempArea.classList.remove("hidden");
    }
    
    const p = state.players[state.activePlayerIdx];
    const isBurstSelecting = (state.currentPhase === 1 && !p.isAI && (!p2pMode || p.id === p2pMyPlayerIdx) && state.outwardSubPhase === "burst_select_2");
    const isStandSelecting = (state.currentPhase === 1 && !p.isAI && (!p2pMode || p.id === p2pMyPlayerIdx) && state.outwardSubPhase === "stand_select_1");

    if (isBurstSelecting || isStandSelecting) {
        tempArea.className = "bg-indigo-50/50 p-4 rounded shadow-md flex flex-col items-center gap-3 z-10 ring-4 ring-indigo-500/20";
    } else {
        tempArea.className = "bg-slate-50 p-4 rounded shadow-inner flex flex-col items-center gap-3 z-10";
    }

    // Display current player's draw title
    const titleEl = document.getElementById("temp-draw-title");
    if (titleEl) {
        if (isBurstSelecting || isStandSelecting) {
            titleEl.innerHTML = `<span class="text-indigo-750 font-black animate-pulse">👉 対象のカードをタップして選択してください</span>`;
        } else {
            titleEl.innerText = `${p.name}がめくったカード`;
        }
    }

    state.drawnCards.forEach(c => {
        const style = getCardStyle(c.id);
        const el = document.createElement("div");
        let isSelected = state.selectedDropCards.includes(c);
        let borderClass = isSelected ? "ring-4 ring-indigo-550 scale-105" : "";
        let hoverClass = (isBurstSelecting || isStandSelecting) ? "cursor-pointer hover:scale-105 transition-all ring-2 ring-indigo-300 animate-pulse" : "";
        
        el.className = `w-[60px] h-[85px] rounded shadow-md flex flex-col items-center justify-center transition-all ${style.color} ${borderClass} ${hoverClass}`;
        el.innerHTML = `<span class="text-3xl">${style.icon}</span>`;
        
        if (isBurstSelecting || isStandSelecting) {
            el.onclick = () => dispatch('SELECT_DROP_CARD', {card: c});
        }
        tempCardsDiv.appendChild(el);
    });
    document.getElementById("temp-sum").innerText = `${calcCurrentSum(state.drawnCards)}`;
    document.getElementById("temp-sum").innerText = `${calcCurrentSum(state.drawnCards)}`;
}

function updateControlButtons() {
    const container = document.getElementById("control-buttons");
    container.innerHTML = "";

    if (state.currentPhase === 1) {
        const p = state.players[state.activePlayerIdx];
        if (!p || p.isAI) return;
        
        if (state.outwardSubPhase === "draw") {
            const sum = calcCurrentSum(state.drawnCards);
            const canDraw = state.deck.length > 0 || state.discardPile.length > 0;
            const canStand = state.drawnCards.length > 0 && sum <= 10;

            const flexRow = document.createElement("div");
            flexRow.className = "flex gap-2 w-full justify-center";
            const drawBtn = document.createElement("button");
            drawBtn.onclick = () => { if(window.sound) sound.click(); dispatch('HIT_CARD'); };
            drawBtn.disabled = !canDraw;
            drawBtn.className = "px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
            drawBtn.innerHTML = `<i data-lucide="layers" class="w-3.5 h-3.5"></i><span>めくる</span>`;

            const standBtn = document.createElement("button");
            standBtn.onclick = () => { if(window.sound) sound.click(); dispatch('STAND'); };
            standBtn.disabled = !canStand;
            standBtn.className = "px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
            standBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i><span>完了</span>`;
            
            flexRow.appendChild(drawBtn); flexRow.appendChild(standBtn);
            container.appendChild(flexRow);
            if(window.lucide) lucide.createIcons();
        }
    } else if (state.currentPhase === 2) {
        const p = state.players[state.activePlayerIdx];
        if (!p || p.isAI) return;

        let canBuyAny = false;
        state.nohinPool.forEach(c => { if (canAfford(p, c)) canBuyAny = true; });

        const passBtn = document.createElement("button");
        passBtn.onclick = () => { if(window.sound) sound.click(); dispatch('PASS_DRAFT'); };
        
        if (canBuyAny && p.nohin.length === 0) {
            passBtn.disabled = true;
            passBtn.innerText = "パス (最低1枚は購入必須)";
            passBtn.className = "w-full py-3.5 bg-slate-100 text-slate-400 text-xs font-bold rounded cursor-not-allowed";
        } else {
            passBtn.innerText = "パスして取引を終了する";
            passBtn.className = "w-full py-3.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded shadow-md transition-all cursor-pointer";
        }
        container.appendChild(passBtn);
    }
}

// Modals logic
function openPlotModal(player) {
    const modal = document.getElementById("plot-modal");
    modal.classList.remove("hidden");
    const container = document.getElementById("plot-card-options");
    container.innerHTML = "";

    const uniqueCards = [];
    const seen = new Set();
    player.hand.forEach(c => {
        if (!seen.has(c.id)) { seen.add(c.id); uniqueCards.push(c); }
    });
    player.nohin.forEach(c => {
        if (!seen.has(c.id)) { seen.add(c.id); uniqueCards.push(c); }
    });
    uniqueCards.forEach(c => {
        const style = getCardStyle(c.id);
        const btn = document.createElement("button");
        btn.onclick = () => {
            modal.classList.add("hidden");
            dispatch('SUBMIT_PLOT', { player, card: c });
        };
        btn.className = `w-[60px] h-[85px] rounded flex flex-col items-center justify-center cursor-pointer hover:scale-105 transition-all shadow-md ${style.color}`;
        btn.innerHTML = `<span class="text-3xl">${style.icon}</span>`;
        container.appendChild(btn);
    });
}

function openWildModal(player) {
    const modal = document.getElementById("wild-modal");
    modal.classList.remove("hidden");
    const container = document.getElementById("wild-step-options");
    container.innerHTML = "";
    [1, 2, 3].forEach(step => {
        const btn = document.createElement("button");
        btn.onclick = () => {
            modal.classList.add("hidden");
            dispatch('SUBMIT_WILD', { player, step });
        };
        btn.className = "w-12 h-12 bg-slate-800 text-white font-bold rounded hover:bg-slate-700 text-lg hover:scale-105 transition-all shadow-md";
        btn.innerText = step;
        container.appendChild(btn);
    });
}

function openDiscardModal(player) {
    const modal = document.getElementById("discard-modal");
    modal.classList.remove("hidden");
    const container = document.getElementById("discard-card-options");
    container.innerHTML = "";
    
    if (player.hand.length === 0 && player.nohin.length === 0) {
        modal.classList.add("hidden");
        state.actionMessage = `手札がありません...`; state.actionMessageIsAlert = false;
        renderAll();
        state.currentTurnIndex++;
        delayDispatch('EXECUTE_MOVE', 800);
        return;
    }

    const uniqueCards = [];
    const seen = new Set();
    player.hand.forEach(c => {
        if (!seen.has(c.id)) { seen.add(c.id); uniqueCards.push(c); }
    });
    player.nohin.forEach(c => {
        if (!seen.has(c.id)) { seen.add(c.id); uniqueCards.push(c); }
    });

    uniqueCards.forEach(c => {
        const style = getCardStyle(c.id);
        const btn = document.createElement("button");
        btn.onclick = () => {
            modal.classList.add("hidden");
            dispatch('SUBMIT_DISCARD', { player, card: c });
        };
        btn.className = `w-[60px] h-[85px] rounded flex flex-col items-center justify-center hover:scale-105 cursor-pointer transition-all shadow-md ${style.color}`;
        btn.innerHTML = `<span class="text-3xl">${style.icon}</span>`;
        container.appendChild(btn);
    });
}

function toggleRulesModal(show) {
    if(window.sound) sound.click();
    const modal = document.getElementById("rules-modal");
    if(show) {
        modal.classList.remove("hidden");
        setTimeout(() => modal.classList.add("opacity-100"), 10);
    } else {
        modal.classList.add("hidden");
    }
}

// Entry points and Setup
let selectedPlayers = 4;
let p2pConn = null;
let p2pMode = false;
let p2pRole = ""; // "host" or "guest"
let p2pMyPlayerIdx = 0;
let p2pPlots = {
    secrets: {},
    reveals: {},
    myCard: null,
    myWild: null,
    myRevealSent: false,
    reset() {
        this.secrets = {};
        this.reveals = {};
        this.myCard = null;
        this.myWild = null;
        this.myRevealSent = false;
    }
};

function p2pShowStatus(msg, isPulse = false) {
    const box = document.getElementById("p2p-status-box");
    if (!box) return;
    box.classList.remove("hidden");
    box.innerText = msg;
    if (isPulse) {
        box.classList.add("animate-pulse");
    } else {
        box.classList.remove("animate-pulse");
    }
}

function p2pCreateRoom() {
    p2pShowStatus("部屋を作成中...", true);
    const peer = new Peer();
    
    peer.on('open', (id) => {
        p2pMode = true;
        p2pRole = "host";
        p2pMyPlayerIdx = 0;
        
        const shareUrl = window.location.origin + window.location.pathname + "?join=" + id;
        
        navigator.clipboard.writeText(shareUrl).then(() => {
            p2pShowStatus(`部屋作成！招待リンクをコピーしました。ID: ${id}`, false);
            alert(`招待リンクをクリップボードにコピーしました！対戦相手に送ってください。\n部屋ID: ${id}`);
        }).catch(err => {
            p2pShowStatus(`部屋ID: ${id} (リンクコピー失敗)`, false);
            alert(`部屋ID: ${id}\n招待リンクのコピーに失敗しました。手動でコピーしてください:\n${shareUrl}`);
        });
    });
    
    peer.on('connection', (conn) => {
        p2pConn = conn;
        p2pSetupConnectionCallbacks(conn);
    });
    
    peer.on('error', (err) => {
        console.error(err);
        p2pShowStatus(`エラーが発生しました: ${err.type}`, false);
    });
}

function p2pJoinRoom() {
    const roomId = document.getElementById("p2p-room-input").value.trim();
    if (!roomId) {
        alert("部屋IDを入力してください。");
        return;
    }
    
    p2pShowStatus("接続中...", true);
    const peer = new Peer();
    
    peer.on('open', (id) => {
        p2pMode = true;
        p2pRole = "guest";
        p2pMyPlayerIdx = 1;
        
        const conn = peer.connect(roomId);
        p2pConn = conn;
        p2pSetupConnectionCallbacks(conn);
    });
    
    peer.on('error', (err) => {
        console.error(err);
        p2pShowStatus(`接続失敗: ${err.type}`, false);
    });
}

function p2pSetupConnectionCallbacks(conn) {
    conn.on('open', () => {
        p2pShowStatus("対戦相手と接続されました！", false);
        
        document.getElementById("btn-pc-2").disabled = true;
        document.getElementById("btn-pc-3").disabled = true;
        document.getElementById("btn-pc-4").disabled = true;
        document.getElementById("btn-pc-5").disabled = true;
        document.getElementById("btn-solo-start").disabled = true;
        document.getElementById("btn-p2p-host").disabled = true;
        document.getElementById("btn-p2p-join").disabled = true;
        
        if (p2pRole === "host") {
            setTimeout(() => {
                confirmSetupAndStart();
            }, 1000);
        }
    });
    
    conn.on('data', (data) => {
        handleIncomingP2PData(data);
    });
    
    conn.on('close', () => {
        p2pShowStatus("対戦相手が切断しました。", false);
        alert("対戦相手との接続が切れました。リロードしてやり直してください。");
    });
}

function handleIncomingP2PData(data) {
    if (data.type === 'SYNC_INIT') {
        p2pMode = true;
        p2pRole = 'guest';
        
        state.deck = data.state.deck;
        state.nohinDeck = data.state.nohinDeck;
        state.nohinPool = data.state.nohinPool;
        state.road = data.state.road;
        state.currentPhase = data.state.currentPhase;
        state.roundCounter = data.state.roundCounter;
        state.activePlayerIdx = data.state.activePlayerIdx;
        state.outwardSubPhase = data.state.outwardSubPhase;
        state.passedPlayers = data.state.passedPlayers;
        state.turnOrder = [];
        
        state.players = data.state.players.map(pData => {
            const p = new Player(pData.id, pData.name, pData.isAI);
            p.hand = pData.hand;
            p.nohin = pData.nohin;
            p.pos = pData.pos;
            p.alive = pData.alive;
            p.escaped = pData.escaped;
            p.startOrder = pData.startOrder;
            p.colorClass = pData.colorClass;
            return p;
        });

        data.state.turnOrder.forEach(pData => {
            state.turnOrder.push(state.players.find(p => p.id === pData.id));
        });

        log("<b>ホストと同期完了。ゲームを開始します！</b>", "system");
        
        const modal = document.getElementById("setup-modal");
        if (modal) modal.classList.add("hidden");
        
        const host = state.players.find(p => p.name === "あなた");
        if (host) host.name = "対戦相手(ホスト)";
        
        const me = state.players.find(p => p.name === "対戦相手");
        if (me) {
            me.name = "あなた";
            p2pMyPlayerIdx = me.id;
        }
        
        renderAll();
        startActivePlayerTurn();
    }
    else if (data.type === 'ACTION') {
        const prevP2PMode = p2pMode;
        p2pMode = false; // Disable temporarily to prevent echo loop
        dispatch(data.action, data.payload);
        p2pMode = prevP2PMode;
    }
    else if (data.type === 'PLOT_SECRET') {
        p2pPlots.secrets[data.playerId] = true;
        checkP2PPlotsReady();
    }
    else if (data.type === 'PLOT_REVEAL') {
        p2pPlots.reveals[data.playerId] = { card: data.card, wildDecision: data.wildDecision };
        checkP2PPlotsReady();
    }
}

function checkP2PPlotsReady() {
    if (!p2pMode || !p2pConn) return;
    
    const activePlayers = state.players.filter(p => p.alive && !p.escaped);
    
    let allSecretsReady = true;
    activePlayers.forEach(p => {
        if (p.id === p2pMyPlayerIdx) {
            if (!p2pPlots.myCard) allSecretsReady = false;
        } else {
            if (!p2pPlots.secrets[p.id]) allSecretsReady = false;
        }
    });
    
    if (allSecretsReady) {
        if (!p2pPlots.myRevealSent) {
            p2pPlots.myRevealSent = true;
            if (p2pRole === 'host') {
                activePlayers.forEach(p => {
                    if (p.id === p2pMyPlayerIdx) {
                        p2pConn.send({ type: 'PLOT_REVEAL', playerId: p.id, card: p2pPlots.myCard, wildDecision: p2pPlots.myWild });
                    } else if (p.isAI) {
                        p2pConn.send({ type: 'PLOT_REVEAL', playerId: p.id, card: state.plotCards[p.id], wildDecision: state.wildDecisions[p.id] });
                    }
                });
            } else {
                p2pConn.send({ type: 'PLOT_REVEAL', playerId: p2pMyPlayerIdx, card: p2pPlots.myCard, wildDecision: p2pPlots.myWild });
            }
        }
    }
    
    let allRevealsReady = true;
    activePlayers.forEach(p => {
        if (p.id === p2pMyPlayerIdx) {
            if (!p2pPlots.myCard) allRevealsReady = false;
        } else {
            if (!p2pPlots.reveals[p.id]) allRevealsReady = false;
        }
    });
    
    if (allRevealsReady) {
        activePlayers.forEach(p => {
            if (p.id !== p2pMyPlayerIdx) {
                state.plotCards[p.id] = p2pPlots.reveals[p.id].card;
                state.wildDecisions[p.id] = p2pPlots.reveals[p.id].wildDecision;
            }
        });
        dispatch('CHECK_ALL_PLOTTED');
    }
}

function selectPlayerCount(count) {
    if(window.sound) sound.click();
    selectedPlayers = count;
    [2, 3, 4, 5].forEach(c => {
        const btn = document.getElementById(`btn-pc-${c}`);
        if (!btn) return;
        if (c === count) {
            btn.className = "py-2 bg-indigo-600 text-white font-bold rounded text-xs transition-all shadow-md";
        } else {
            btn.className = "py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-xs transition-all shadow-sm";
        }
    });
}

function confirmSetupAndStart() {
    if(window.sound) sound.click();
    const modal = document.getElementById("setup-modal");
    if (modal) modal.classList.add("hidden");
    startGame(selectedPlayers);
}

function initGame(playerCount = 4) { dispatch('INIT_GAME', { playerCount }); }
function startGame(playerCount = 4) { if(window.resumeAudio) resumeAudio(); if(window.sound) sound.click(); initGame(playerCount); }
function resetGame() {
    if(window.resumeAudio) resumeAudio(); if(window.sound) sound.click();
    if(confirm("ゲームをリセットして最初からやり直しますか？")) location.reload();
}

window.onload = () => {
    if(window.lucide) lucide.createIcons();
    
    // Check if join ID is present in query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get('join');
    if (joinId) {
        const input = document.getElementById('p2p-room-input');
        if (input) {
            input.value = joinId;
            p2pJoinRoom();
        }
    }
};

function triggerScreenEffect(type) {
    if (isSimulation) return;
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center pointer-events-none transition-opacity duration-300";
    if (type === 'burst') {
        overlay.innerHTML = `<div class="bg-rose-600/60 absolute inset-0 mix-blend-multiply"></div>
                             <div class="relative text-white font-black text-6xl md:text-8xl drop-shadow-[0_0_20px_rgba(225,29,72,0.8)] transform scale-50 opacity-0 transition-all duration-300" id="effect-text">BURST!</div>`;
    } else if (type === 'nara') {
        overlay.innerHTML = `<div class="bg-slate-900/60 absolute inset-0 mix-blend-multiply"></div>
                             <div class="relative text-white font-black text-5xl md:text-7xl drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] transform scale-50 opacity-0 transition-all duration-300 flex flex-col items-center" id="effect-text"><span class="text-6xl mb-4">🗡️</span>罠発動!</div>`;
    }
    document.body.appendChild(overlay);
    
    // Animate in
    setTimeout(() => {
        const text = overlay.querySelector('#effect-text');
        if (text) {
            text.classList.remove("scale-50", "opacity-0");
            text.classList.add("scale-110", "opacity-100");
            
            setTimeout(() => {
                text.classList.remove("scale-110");
                text.classList.add("scale-100");
            }, 150);
        }
    }, 10);
    
    // Animate out and remove
    setTimeout(() => {
        overlay.classList.add("opacity-0");
        setTimeout(() => overlay.remove(), 300);
    }, 1200);
}