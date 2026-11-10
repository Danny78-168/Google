export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API 路由：計算路單與問路預測
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      const { history } = await request.json(); // 輸入陣列例如: ['B', 'P', 'B', 'B', 'T', 'P']
      const analysis = analyzeBaccarat(history);
      return new Response(JSON.stringify(analysis), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 預設路由：直接輸出單頁 Web 應用程式 (SPA)
    return new Response(renderHTML(), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }
};

// ----------------------------------------------------
// 百家樂大路與下三路演算法核心
// ----------------------------------------------------
function analyzeBaccarat(history) {
  // 1. 生成大路矩陣 (Big Road Matrix)
  // 大路結構：每列陣列，和局不開新列/格，記錄在最後一顆上
  let bigRoad = []; // 二維陣列 columns: [ [{ outcome: 'B', ties: 0 }, ...], ... ]
  let currentCol = -1;
  let lastOutcome = null;

  for (const item of history) {
    if (item === 'T') {
      if (bigRoad.length > 0 && currentCol >= 0) {
        const col = bigRoad[currentCol];
        col[col.length - 1].ties = (col[col.length - 1].ties || 0) + 1;
      }
      continue;
    }

    if (item !== lastOutcome) {
      bigRoad.push([{ outcome: item, ties: 0 }]);
      currentCol++;
      lastOutcome = item;
    } else {
      bigRoad[currentCol].push({ outcome: item, ties: 0 });
    }
  }

  // 2. 下三路推導函式 (offset: 1=大眼仔, 2=小路, 3=曱甴路)
  function getDerivedRoad(offset) {
    const derived = [];
    // 下三路起始點判定
    for (let c = offset; c < bigRoad.length; c++) {
      const colLength = bigRoad[c].length;
      const startRow = (c === offset) ? 1 : 0;

      for (let r = startRow; r < colLength; r++) {
        if (r === 0) {
          // 換列新開：比對前 1 列與前 (1+offset) 列的長度是否齊頭
          const lenPrev = bigRoad[c - 1].length;
          const lenTarget = bigRoad[c - 1 - offset].length;
          derived.push(lenPrev === lenTarget ? 'RED' : 'BLUE');
        } else {
          // 列內向下：檢查前 offset 列對應位置是否有球
          const targetCol = bigRoad[c - offset];
          if (targetCol && targetCol.length > r) {
            derived.push('RED'); // 有球 / 齊頭
          } else if (targetCol && targetCol.length === r) {
            derived.push('RED'); // 剛好平頭
          } else {
            derived.push('BLUE'); // 長度落後或落空
          }
        }
      }
    }
    return derived;
  }

  // 3. 問路推演 (虛擬下一口開莊或開閒的下三路顏色)
  function simulateNext(nextOutcome) {
    const virtualHistory = [...history, nextOutcome];
    // 使用虛擬歷史快速跑一次大路與下三路
    const vRes = analyzeBaccaratRaw(virtualHistory);
    return {
      bigEye: vRes.bigEye[vRes.bigEye.length - 1] || null,
      smallRoad: vRes.smallRoad[vRes.smallRoad.length - 1] || null,
      cockroach: vRes.cockroach[vRes.cockroach.length - 1] || null
    };
  }

  const bigEye = getDerivedRoad(1);
  const smallRoad = getDerivedRoad(2);
  const cockroach = getDerivedRoad(3);

  const bankerAsk = simulateNext('B');
  const playerAsk = simulateNext('P');

  // 計算推薦方向（三紅高權重）
  const bankerRedCount = Object.values(bankerAsk).filter(v => v === 'RED').length;
  const playerRedCount = Object.values(playerAsk).filter(v => v === 'RED').length;

  let recommendation = '觀望';
  if (bankerRedCount >= 2 && bankerRedCount > playerRedCount) recommendation = '莊 (順勢/齊頭)';
  if (playerRedCount >= 2 && playerRedCount > bankerRedCount) recommendation = '閒 (順勢/齊頭)';

  return {
    bigRoad,
    bigEye,
    smallRoad,
    cockroach,
    ask: { banker: bankerAsk, player: playerAsk },
    recommendation
  };
}

// 輔助函式供問路虛擬推導
function analyzeBaccaratRaw(history) {
  let bigRoad = [];
  let currentCol = -1;
  let lastOutcome = null;
  for (const item of history) {
    if (item === 'T') {
      if (bigRoad.length > 0 && currentCol >= 0) {
        bigRoad[currentCol][bigRoad[currentCol].length - 1].ties += 1;
      }
      continue;
    }
    if (item !== lastOutcome) {
      bigRoad.push([{ outcome: item, ties: 0 }]);
      currentCol++;
      lastOutcome = item;
    } else {
      bigRoad[currentCol].push({ outcome: item, ties: 0 });
    }
  }
  const getD = (offset) => {
    const derived = [];
    for (let c = offset; c < bigRoad.length; c++) {
      const startRow = (c === offset) ? 1 : 0;
      for (let r = startRow; r < bigRoad[c].length; r++) {
        if (r === 0) {
          derived.push(bigRoad[c - 1].length === bigRoad[c - 1 - offset].length ? 'RED' : 'BLUE');
        } else {
          derived.push((bigRoad[c - offset] && bigRoad[c - offset].length >= r) ? 'RED' : 'BLUE');
        }
      }
    }
    return derived;
  };
  return { bigEye: getD(1), smallRoad: getD(2), cockroach: getD(3) };
}

// ----------------------------------------------------
// 前端 UI 介面 (HTML + Canvas 渲染路單)
// ----------------------------------------------------
function renderHTML() {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>百家樂路單分析助手</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 16px; }
    .container { max-width: 600px; margin: 0 auto; }
    .card { background: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); }
    h2 { font-size: 1.1rem; margin: 0 0 12px 0; color: #94a3b8; }
    .btn-group { display: grid; grid-template-columns: 1fr 1fr 1fr 0.8fr; gap: 8px; margin-bottom: 16px; }
    button { border: none; border-radius: 8px; padding: 12px 0; font-size: 1rem; font-weight: bold; cursor: pointer; transition: opacity 0.2s; }
    button:active { opacity: 0.8; }
    .btn-banker { background: #ef4444; color: white; }
    .btn-player { background: #3b82f6; color: white; }
    .btn-tie { background: #10b981; color: white; }
    .btn-undo { background: #475569; color: #cbd5e1; }
    .ask-board { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
    .ask-box { background: #0f172a; padding: 10px; border-radius: 8px; font-size: 0.9rem; }
    .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin: 0 2px; vertical-align: middle; }
    .dot-red { background: #ef4444; }
    .dot-blue { background: #3b82f6; }
    .recom-box { font-size: 1.25rem; font-weight: bold; color: #f59e0b; text-align: center; margin: 12px 0; }
    canvas { background: #0f172a; border-radius: 8px; width: 100%; height: 160px; display: block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h2>即時開牌紀錄</h2>
      <div class="btn-group">
        <button class="btn-banker" onclick="addOutcome('B')">莊 (B)</button>
        <button class="btn-player" onclick="addOutcome('P')">閒 (P)</button>
        <button class="btn-tie" onclick="addOutcome('T')">和 (T)</button>
        <button class="btn-undo" onclick="undo()">退回</button>
      </div>
      <canvas id="roadCanvas" width="600" height="240"></canvas>
    </div>

    <div class="card">
      <h2>推薦分析與問路指標</h2>
      <div class="recom-box" id="recomText">建議：等待輸入開局</div>
      <div class="ask-board">
        <div class="ask-box" id="bankerAskBox">莊問路：-</div>
        <div class="ask-box" id="playerAskBox">閒問路：-</div>
      </div>
    </div>
  </div>

  <script>
    let history = [];

    async function addOutcome(val) {
      history.push(val);
      await refresh();
    }

    async function undo() {
      history.pop();
      await refresh();
    }

    async function refresh() {
      if (history.length === 0) {
        document.getElementById('recomText').innerText = '建議：等待輸入開局';
        document.getElementById('bankerAskBox').innerHTML = '莊問路：-';
        document.getElementById('playerAskBox').innerHTML = '閒問路：-';
        drawRoad({ bigRoad: [] });
        return;
      }
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history })
      });
      const data = await res.json();
      
      document.getElementById('recomText').innerText = '推薦方向：' + data.recommendation;
      document.getElementById('bankerAskBox').innerHTML = '莊問路: ' + formatDots(data.ask.banker);
      document.getElementById('playerAskBox').innerHTML = '閒問路: ' + formatDots(data.ask.player);
      drawRoad(data);
    }

    function formatDots(ask) {
      const getDot = (val) => val === 'RED' ? '<span class="dot dot-red"></span>' : (val === 'BLUE' ? '<span class="dot dot-blue"></span>' : '-');
      return getDot(ask.bigEye) + getDot(ask.smallRoad) + getDot(ask.cockroach);
    }

    function drawRoad(data) {
      const canvas = document.getElementById('roadCanvas');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cellSize = 20;
      ctx.strokeStyle = '#1e293b';
      for (let x = 0; x < canvas.width; x += cellSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += cellSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      if (!data.bigRoad) return;
      data.bigRoad.forEach((col, colIdx) => {
        col.forEach((item, rowIdx) => {
          const cx = colIdx * cellSize + cellSize / 2;
          const cy = rowIdx * cellSize + cellSize / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 7, 0, Math.PI * 2);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = item.outcome === 'B' ? '#ef4444' : '#3b82f6';
          ctx.stroke();

          if (item.ties > 0) {
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy - 5);
            ctx.lineTo(cx + 5, cy + 5);
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      });
    }
    refresh();
  </script>
</body>
</html>`;
}
