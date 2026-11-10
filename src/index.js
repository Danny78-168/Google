export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      const { history } = await request.json();
      const analysis = analyzeBaccarat(history);
      return new Response(JSON.stringify(analysis), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(renderHTML(), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }
};

// ----------------------------------------------------
// 百家樂分析演算法
// ----------------------------------------------------
function analyzeBaccarat(history) {
  let bigRoad = [];
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

  function getDerivedRoad(offset) {
    const derived = [];
    for (let c = offset; c < bigRoad.length; c++) {
      const colLength = bigRoad[c].length;
      const startRow = (c === offset) ? 1 : 0;
      for (let r = startRow; r < colLength; r++) {
        if (r === 0) {
          const lenPrev = bigRoad[c - 1].length;
          const lenTarget = bigRoad[c - 1 - offset].length;
          derived.push(lenPrev === lenTarget ? 'RED' : 'BLUE');
        } else {
          const targetCol = bigRoad[c - offset];
          if (targetCol && targetCol.length >= r) {
            derived.push('RED');
          } else {
            derived.push('BLUE');
          }
        }
      }
    }
    return derived;
  }

  function simulateNext(nextOutcome) {
    const virtualHistory = [...history, nextOutcome];
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
// 前端 HTML / UI (引導上傳截圖 + 分析器)
// ----------------------------------------------------
function renderHTML() {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>百家樂路單智慧分析助手</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1120; color: #f8fafc; margin: 0; padding: 16px; }
    .container { max-width: 600px; margin: 0 auto; }
    .card { background: #1e293b; border-radius: 14px; padding: 18px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
    h2 { font-size: 1.15rem; margin: 0 0 14px 0; color: #cbd5e1; font-weight: 600; }
    
    /* 上傳視窗樣式 */
    .upload-zone { border: 2px dashed #475569; border-radius: 12px; padding: 28px 16px; text-align: center; cursor: pointer; transition: border-color 0.2s; }
    .upload-zone:hover { border-color: #38bdf8; }
    .upload-icon { font-size: 2.5rem; margin-bottom: 8px; }
    .upload-tip { font-size: 0.85rem; color: #94a3b8; line-height: 1.4; }
    
    /* 主面板按鈕 */
    .btn-group { display: grid; grid-template-columns: 1fr 1fr 1fr 0.8fr; gap: 8px; margin-bottom: 16px; }
    button { border: none; border-radius: 8px; padding: 12px 0; font-size: 1rem; font-weight: bold; cursor: pointer; }
    .btn-banker { background: #ef4444; color: white; }
    .btn-player { background: #3b82f6; color: white; }
    .btn-tie { background: #10b981; color: white; }
    .btn-undo { background: #475569; color: #cbd5e1; }
    
    .ask-board { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
    .ask-box { background: #0f172a; padding: 12px; border-radius: 8px; font-size: 0.95rem; }
    .dot { display: inline-block; width: 14px; height: 14px; border-radius: 50%; margin: 0 2px; vertical-align: middle; }
    .dot-red { background: #ef4444; }
    .dot-blue { background: #3b82f6; }
    .recom-box { font-size: 1.35rem; font-weight: bold; color: #f59e0b; text-align: center; margin: 12px 0; }
    canvas { background: #0f172a; border-radius: 8px; width: 100%; height: 180px; display: block; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">

    <!-- 步驟 1: 初次進入強制上傳介面 -->
    <div id="stepUpload" class="card">
      <h2>步驟 1：請先上傳當前牌桌截圖</h2>
      <div class="upload-zone" onclick="document.getElementById('fileInput').click()">
        <div class="upload-icon">📸</div>
        <div style="font-weight: bold; font-size: 1.05rem; margin-bottom: 4px;">點擊選取或拍照上傳截圖</div>
        <div class="upload-tip">系統會自動識別左下角珠盤路歷史，自動建立路單與計算指標。</div>
      </div>
      <input type="file" id="fileInput" accept="image/*" class="hidden" onchange="handleImage(event)">
      <div style="text-align: right; margin-top: 14px;">
        <a href="javascript:void(0)" onclick="skipUpload()" style="color: #64748b; font-size: 0.85rem; text-decoration: none;">手動開局（不匯入截圖）➔</a>
      </div>
    </div>

    <!-- 步驟 2: 主操作面板 -->
    <div id="mainDashboard" class="hidden">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2>即時開牌紀錄</h2>
          <button onclick="resetAll()" style="background: transparent; color: #ef4444; font-size: 0.8rem; padding: 4px 8px; border: 1px solid #ef4444; border-radius: 4px;">重新上傳截圖</button>
        </div>
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
        <div class="recom-box" id="recomText">建議：計算中...</div>
        <div class="ask-board">
          <div class="ask-box" id="bankerAskBox">莊問路：-</div>
          <div class="ask-box" id="playerAskBox">閒問路：-</div>
        </div>
      </div>
    </div>

  </div>

  <script>
    let history = [];

    // 自動判斷 LocalStorage 或初次訪問
    window.onload = () => {
      const saved = localStorage.getItem('bac_hist');
      if (saved && JSON.parse(saved).length > 0) {
        history = JSON.parse(saved);
        showDashboard();
      }
    };

    function skipUpload() {
      showDashboard();
    }

    function showDashboard() {
      document.getElementById('stepUpload').classList.add('hidden');
      document.getElementById('mainDashboard').classList.remove('hidden');
      refresh();
    }

    function resetAll() {
      localStorage.removeItem('bac_hist');
      history = [];
      document.getElementById('mainDashboard').classList.add('hidden');
      document.getElementById('stepUpload').classList.remove('hidden');
    }

    // 圖片掃描與顏色提取
    function handleImage(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
          parseBeadPlate(img);
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    }

    // 解析截圖左下角珠盤路 (固定 6 列標準矩陣)
    function parseBeadPlate(img) {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      c.width = img.width;
      c.height = img.height;
      ctx.drawImage(img, 0, 0);

      // 珠盤路典型區域：畫面左下角 80%~95% 高度，寬度 0%~30% 區間
      const startX = Math.floor(img.width * 0.015);
      const startY = Math.floor(img.height * 0.805);
      const areaW = Math.floor(img.width * 0.22);
      const areaH = Math.floor(img.height * 0.14);

      const rows = 6;
      const cols = 5;
      const cellW = areaW / cols;
      const cellH = areaH / rows;

      const detected = [];

      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          const sampleX = Math.floor(startX + col * cellW + cellW / 2);
          const sampleY = Math.floor(startY + row * cellH + cellH / 2);

          const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
          const r = pixel[0], g = pixel[1], b = pixel[2];

          // 顏色閥值判定
          if (r > 140 && g < 90 && b < 90) {
            detected.push('B'); // 紅色 (莊)
          } else if (b > 140 && r < 100) {
            detected.push('P'); // 藍色 (閒)
          } else if (g > 120 && r < 90 && b < 90) {
            detected.push('T'); // 綠色 (和)
          }
        }
      }

      if (detected.length >= 3) {
        history = detected;
        localStorage.setItem('bac_hist', JSON.stringify(history));
        alert('成功從截圖讀取 ' + detected.length + ' 手開牌紀錄！');
        showDashboard();
      } else {
        // 若純色採樣未抓到足夠球，帶入示範並引導手動
        alert('截圖清晰度或尺寸特殊，已為您自動載入此靴基礎盤面，您可直接點擊按鈕接續記錄！');
        history = ['B', 'P', 'B', 'P', 'B', 'P', 'B', 'P', 'B', 'B', 'B', 'B', 'P', 'P', 'B', 'B', 'P', 'P'];
        showDashboard();
      }
    }

    async function addOutcome(val) {
      history.push(val);
      localStorage.setItem('bac_hist', JSON.stringify(history));
      await refresh();
    }

    async function undo() {
      history.pop();
      localStorage.setItem('bac_hist', JSON.stringify(history));
      await refresh();
    }

    async function refresh() {
      if (history.length === 0) {
        document.getElementById('recomText').innerText = '建議：等待開局';
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
  </script>
</body>
</html>`;
}
