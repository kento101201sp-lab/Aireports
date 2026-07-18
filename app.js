// =========================================================================
// 1. グローバル状態管理 ＆ キー定義
// =========================================================================
const STORAGE_KEY = 'life_report_production_settings_v2';
const PROJECTS_LIST_KEY = 'life_report_projects_meta_list';
const CHAT_LOGS_KEY = 'life_report_chat_logs';
const REPORT_DATA_KEY = 'life_report_panes_data_v2';

let currentProjectId = '';
let chatLogs = []; 

const chatHistory = document.getElementById('chatHistory');
const chatInput = document.getElementById('chatInput');
let attachedFileData = null; 
let attachedFileName = "";

function getChatLogsKey() { return `${CHAT_LOGS_KEY}_${currentProjectId}`; }
function getReportDataKey() { return `${REPORT_DATA_KEY}_${currentProjectId}`; }

// =========================================================================
// 2. プロジェクト生成・管理
// =========================================================================
function getLocalProjectsList() {
  return JSON.parse(localStorage.getItem(PROJECTS_LIST_KEY) || '[]');
}

function saveLocalProjectsList(list) {
  localStorage.setItem(PROJECTS_LIST_KEY, JSON.stringify(list));
}

function createNewProject() {
  let projects = getLocalProjectsList();

  if (projects.length > 0) {
    const latestProj = projects[0];
    const logKey = `${CHAT_LOGS_KEY}_${latestProj.id}`;
    const logs = JSON.parse(localStorage.getItem(logKey) || '[]');
    const hasUserMessage = logs.some(log => log.sender === 'user');

    // 空のプロジェクトが既にあればそれを再利用して無駄な生成を防ぐ
    if (!hasUserMessage) {
      currentProjectId = latestProj.id;
      setActiveProjectUI(latestProj.id, latestProj.name);

      const savedReports = localStorage.getItem(getReportDataKey());
      if (savedReports) applyReportData(JSON.parse(savedReports));

      chatLogs = logs;
      if (chatHistory) {
        chatHistory.innerHTML = '';
        if (chatLogs.length > 0) {
          chatLogs.forEach(log => appendMessageToUI(log.sender, log.text, log.image));
        } else {
          setDefaultInitialAIMessage();
        }
      }
      renderProjectsList();
      return;
    }
  }

  const id = 'proj_' + Date.now();
  const now = new Date();
  const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const defaultName = `新規プロジェクト (${timeStr})`;

  currentProjectId = id;
  projects.unshift({ id: id, name: defaultName });
  saveLocalProjectsList(projects);

  chatLogs = [];
  localStorage.removeItem(getChatLogsKey());

  const initialReport = {
    current: '<h4>概要</h4><p>新しいプロジェクトが開始されました。目標やタスク、開発要件について自由に対話を開始してください。</p><h4>決定事項</h4><ul><li>（対話の内容に応じてここに自動集約されます）</li></ul>',
    knowledge: '<h4>ナレッジ</h4><ul><li>（重要なルールや技術仕様がここに蓄積されます）</li></ul>',
    memory: '<h4>個別メモリ 🧠</h4><p>このプロジェクト固有の状況や、特定の対話において覚えておいてほしい背景情報をAIがここに記憶します。</p>',
    history: '<h4>履歴</h4><ul><li>プロジェクト作成</li></ul>'
  };
  localStorage.setItem(getReportDataKey(), JSON.stringify(initialReport));

  renderProjectsList();
  setActiveProjectUI(id, defaultName);
  applyReportData(initialReport);
  setDefaultInitialAIMessage();

  saveChatLogs();
  saveReportData();
}

function triggerNewProject() {
  createNewProject();
  toggleBottomSheet();
}

function renderProjectsList() {
  const listEl = document.getElementById('projectList');
  if (!listEl) return;
  const projects = getLocalProjectsList();
  listEl.innerHTML = '';

  if (projects.length === 0) {
    listEl.innerHTML = '<li class="sheet-item" style="text-align:center; color:#00f3ff; text-shadow: 0 0 6px rgba(0,243,255,0.6); font-family:monospace; pointer-events:none;">セッション履歴がありません</li>';
    return;
  }

  projects.forEach(proj => {
    const li = document.createElement('li');
    li.className = `sheet-item ${proj.id === currentProjectId ? 'active' : ''}`;
    li.setAttribute('data-id', proj.id);
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'sheet-item-name';
    nameSpan.textContent = proj.name;
    nameSpan.onclick = () => selectProject(proj.id, proj.name);
    li.appendChild(nameSpan);

    const delBtn = document.createElement('span');
    delBtn.className = 'project-del-btn';
    delBtn.innerHTML = '🗑️';
    delBtn.title = 'プロジェクトを削除';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteProject(proj.id, proj.name);
    };
    li.appendChild(delBtn);

    listEl.appendChild(li);
  });
}

function deleteProject(id, name) {
  if (!confirm(`プロジェクト「${name}」を削除しますか？\nこの操作は取り消せません。`)) return;

  let projects = getLocalProjectsList();
  projects = projects.filter(p => p.id !== id);
  saveLocalProjectsList(projects);

  localStorage.removeItem(`${CHAT_LOGS_KEY}_${id}`);
  localStorage.removeItem(`${REPORT_DATA_KEY}_${id}`);

  if (currentProjectId === id) {
    if (projects.length > 0) {
      const nextProj = projects[0];
      currentProjectId = nextProj.id;
      setActiveProjectUI(nextProj.id, nextProj.name);

      const savedReports = localStorage.getItem(getReportDataKey());
      if (savedReports) applyReportData(JSON.parse(savedReports));

      const savedLogs = localStorage.getItem(getChatLogsKey());
      chatLogs = savedLogs ? JSON.parse(savedLogs) : [];
      
      if (chatHistory) {
        chatHistory.innerHTML = '';
        if (chatLogs.length > 0) {
          chatLogs.forEach(log => appendMessageToUI(log.sender, log.text, log.image));
        } else {
          setDefaultInitialAIMessage();
        }
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    } else {
      createNewProject();
    }
  }
  renderProjectsList();
}

function setActiveProjectUI(id, name) {
  const titleEl = document.getElementById('headerTitle');
  if (titleEl) titleEl.textContent = name;
  
  document.querySelectorAll('#projectList .sheet-item').forEach(item => {
    if (item.getAttribute('data-id') === id) item.classList.add('active');
    else item.classList.remove('active');
  });
}

function updateProjectName(id, newName) {
  let projects = getLocalProjectsList();
  const targetProj = projects.find(p => p.id === id);
  if (targetProj) {
    targetProj.name = newName;
    saveLocalProjectsList(projects);
    renderProjectsList();
    const titleEl = document.getElementById('headerTitle');
    if (titleEl && currentProjectId === id) titleEl.textContent = newName;
  }
}

// =========================================================================
// 3. UI操作・インタラクション制御
// =========================================================================
function toggleBottomSheet() {
  const sheet = document.getElementById('bottomSheet');
  const overlay = document.getElementById('sheetOverlay');
  if (sheet && overlay) {
    sheet.classList.toggle('open');
    overlay.classList.toggle('open');
  }
}

function openSettings() { 
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.add('open'); 
}

function closeSettings() { 
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.remove('open'); 
}

document.getElementById('settingsModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeSettings();
});

function toggleReportHeight() {
  const reportSection = document.getElementById('reportSection');
  const expandBar = document.getElementById('expandBar');
  if (!reportSection || !expandBar) return;
  reportSection.classList.toggle('expanded');
  expandBar.textContent = reportSection.classList.contains('expanded') ? '▲ レポート領域を縮小 ▲' : '▼ レポート領域を展開 ▼';
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (window.event && window.event.target) {
    window.event.target.classList.add('active');
  }
  document.querySelectorAll('.report-pane').forEach(pane => pane.classList.remove('active'));
  const targetPane = document.getElementById(`pane-${tabName}`);
  if (targetPane) targetPane.classList.add('active');
}

function selectProject(id, name) {
  currentProjectId = id;
  setActiveProjectUI(id, name);

  const savedReports = localStorage.getItem(getReportDataKey());
  if (savedReports) applyReportData(JSON.parse(savedReports));

  const savedLogs = localStorage.getItem(getChatLogsKey());
  if (savedLogs) {
    chatLogs = JSON.parse(savedLogs);
    if (chatHistory) {
      chatHistory.innerHTML = '';
      chatLogs.forEach(log => appendMessageToUI(log.sender, log.text, log.image));
      chatHistory.scrollTop = chatHistory.scrollHeight;
    }
  } else {
    chatLogs = [];
    setDefaultInitialAIMessage();
  }

  toggleBottomSheet();
}

// =========================================================================
// 4. チャット表示・処理コア
// =========================================================================
if (chatInput) {
  chatInput.addEventListener('input', () => {
    chatInput.style.height = '40px';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
  chatInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });
}

function appendMessageToUI(sender, text, base64Image = null) {
  if (!chatHistory) return;
  const msg = document.createElement('div');
  msg.className = `msg ${sender}`;
  
  if (base64Image) {
    msg.innerHTML = `<img src="${base64Image}" style="max-width: 100%; max-height: 180px; border-radius: 8px; display: block; margin-bottom: 4px;">${text ? text : '📸 画像を送信しました'}`;
  } else {
    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    msg.innerHTML = formattedText;
  }
  chatHistory.appendChild(msg);
  
  if (sender === 'user') {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert("画像ファイルのみサポートしています。");
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    attachedFileData = e.target.result; 
    attachedFileName = file.name;
    const container = document.getElementById('previewContainer');
    const text = document.getElementById('previewText');
    if (container && text) {
      text.textContent = `📸 送信待機中: ${file.name}`;
      container.classList.add('active');
    }
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function clearAttachment() {
  attachedFileData = null;
  attachedFileName = "";
  const container = document.getElementById('previewContainer');
  if (container) container.classList.remove('active');
}

async function sendMessage() {
  if (!chatInput) return;
  const text = chatInput.value.trim();
  if (!text && !attachedFileData) return;

  appendMessageToUI('user', text, attachedFileData);
  chatLogs.push({ sender: 'user', text: text, image: attachedFileData });
  saveChatLogs();

  chatInput.value = '';
  chatInput.style.height = '40px';
  clearAttachment();
  chatInput.blur();

  await callRealAiApi();
}

function setDefaultInitialAIMessage() {
  if (!chatHistory) return;
  chatHistory.innerHTML = '';
  appendMessageToUI('ai', 'LifeReport セッションへようこそ！🚀\n\n設定画面（⚙️）からいつでもデータ全体をJSONファイルにエクスポートできます。バックアップやスマホ・PC間のデータ移動に便利です。\n\n大前提のプロフィールやルールを記憶できる「個人メモリ」と合わせて、自由に対話を開始してください！');
}

// =========================================================================
// 5. 多層モデル対応 本番AI API インテグレーション
// =========================================================================
async function callRealAiApi() {
  const callingProjectId = currentProjectId; 
  const activeAiRadio = document.querySelector('input[name="chatAi"]:checked');
  const selectedAi = activeAiRadio ? activeAiRadio.value : 'gemini';
  
  const progressMsg = document.createElement('div');
  progressMsg.className = 'msg ai analyzing';
  progressMsg.innerHTML = '<div class="spinner"></div><span class="progress-text">📡 コンテキストと2層メモリを同期中...</span>';
  
  if (chatHistory) {
    chatHistory.appendChild(progressMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  const currentHTML = document.getElementById('pane-current').innerHTML.trim();
  const knowledgeHTML = document.getElementById('pane-knowledge').innerHTML.trim();
  const memoryHTML = document.getElementById('pane-memory').innerHTML.trim();
  const historyHTML = document.getElementById('pane-history').innerHTML.trim();
  const personalMemoryText = document.getElementById('personalMemory')?.value.trim() || '未設定';

  const systemInstructionText = `あなたは対話を通じてプロジェクトを構造化し、ユーザーに伴走するLifeReportのコアシステムです。

【個人メモリ（全プロジェクト共通の前提・プロフィール）】:
${personalMemoryText}

現在の画面上部のレポートと、このプロジェクト固有の個別メモリ（長期記憶）の状態（HTML）は以下の通りです：
【Current（概要/決定事項）】:
${currentHTML}

【Knowledge（仕様・ルール・知識）】:
${knowledgeHTML}

【Memory（プロジェクト固有の長期記憶）】:
${memoryHTML}

【History（進捗履歴）】:
${historyHTML}

【出力・表現に関する指示】
- ユーザーに返すチャットの返答は、極限まで視認性を重視してください。適度に「太字(**で囲む)」や「箇条書き(- や *)」を用いて構造的に回答してください。
- 对話内容から、上部のレポートやプロジェクト固有のMemoryを「更新」「追記」「修正」すべき情報が生まれたと判断した場合は、通常回答の【一番末尾】に以下の特殊タグを使って最新の全HTML構造（見出し <h4>, リスト <ul><li>, 段落 <p>）を含めて出力してください。修正のないタブのタグは省略可能です。

特殊出力フォーマット（メッセージの末尾に連結）：
<update_current>Currentの最新全HTML</update_current>
<update_knowledge>Knowledgeの最新全HTML</update_knowledge>
<update_memory>Memoryの最新全HTML</update_memory>
<update_history>Historyの最新全HTML</update_history>
<update_title>適切なプロジェクト名</update_title>`;

  try {
    let aiResponseText = "";

    // --- Claude 呼び出し ---
    if (selectedAi === 'claude') {
      const apiKey = document.getElementById('apiKeyClaude').value.trim();
      if (!apiKey) throw new Error("ClaudeのAPIキーが未設定です。⚙️マークから設定してください。");

      const messages = [];
      chatLogs.forEach(log => {
        let contentPayload = [];
        if (log.text) contentPayload.push({ type: "text", text: log.text });
        if (log.image) {
          const commaIdx = log.image.indexOf(',');
          const mediaType = log.image.substring(5, log.image.indexOf(';'));
          const base64Data = log.image.substring(commaIdx + 1);
          contentPayload.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data }
          });
        }
        messages.push({ role: log.sender === 'user' ? 'user' : 'assistant', content: contentPayload });
      });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-3-5-sonnet-latest', system: systemInstructionText, max_tokens: 4000, messages: messages })
      });
      const resData = await response.json();
      if (resData.error) throw new Error(resData.error.message);
      aiResponseText = resData.content[0].text;

    // --- DeepSeek 呼び出し ---
    } else if (selectedAi === 'deepseek') {
      const apiKey = document.getElementById('apiKeyDeepSeek').value.trim();
      if (!apiKey) throw new Error("DeepSeekのAPIキーが未設定です。⚙️マークから設定してください。");

      const messages = [{ role: "system", content: systemInstructionText }];
      chatLogs.forEach(log => {
        if (!log.image) {
          messages.push({ role: log.sender === 'user' ? 'user' : 'assistant', content: log.text || "" });
        } else {
          messages.push({ role: log.sender === 'user' ? 'user' : 'assistant', content: (log.text ? log.text + " (画像添付あり)" : "画像が送信されました") });
        }
      });

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: messages })
      });
      const resData = await response.json();
      if (resData.error) throw new Error(resData.error.message);
      aiResponseText = resData.choices[0].message.content;

    // --- Gemini 呼び出し ---
    } else if (selectedAi === 'gemini') {
      const apiKey = document.getElementById('apiKeyGemini').value.trim();
      if (!apiKey) throw new Error("GeminiのAPIキーが未設定です。⚙️マークから設定してください。");

      const contents = chatLogs.map(log => {
        const parts = [];
        if (log.text) parts.push({ text: log.text });
        if (log.image) {
          const commaIndex = log.image.indexOf(',');
          const mimeType = log.image.substring(5, log.image.indexOf(';'));
          const base64Data = log.image.substring(commaIndex + 1);
          parts.push({ inlineData: { mimeType: mimeType, data: base64Data } });
        }
        if (parts.length === 0) parts.push({ text: "" });
        return { role: log.sender === 'user' ? 'user' : 'model', parts: parts };
      });

      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        let textPart = contents[contents.length - 1].parts.find(p => p.text !== undefined);
        if (!textPart) { textPart = { text: "" }; contents[contents.length - 1].parts.unshift(textPart); }
        textPart.text = `${systemInstructionText}\n\n----------------------------------------\nユーザー指示: ${textPart.text || "（画像受信）"}`;
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contents })
      });
      const resData = await response.json();
      if (resData.error) throw new Error(resData.error.message);
      aiResponseText = resData.candidates[0].content.parts[0].text;

    // --- OpenAI 呼び出し ---
    } else if (selectedAi === 'openai') {
      const apiKey = document.getElementById('apiKeyOpenAI').value.trim();
      if (!apiKey) throw new Error("OpenAIのAPIキーが未設定です。⚙️マークから設定してください。");

      const messages = [{ role: "system", content: systemInstructionText }];
      chatLogs.forEach(log => {
        let contentPayload = [];
        if (log.text) contentPayload.push({ type: "text", text: log.text });
        if (log.image) contentPayload.push({ type: "image_url", image_url: { url: log.image } });
        messages.push({ role: log.sender === 'user' ? 'user' : 'assistant', content: contentPayload.length > 0 ? contentPayload : (log.text || "") });
      });

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: messages })
      });
      const resData = await response.json();
      if (resData.error) throw new Error(resData.error.message);
      aiResponseText = resData.choices[0].message.content;
    }

    // レポート更新タグの解析・抽出
    let reportUpdated = false;
    const currentMatch = aiResponseText.match(/<update_current>([\s\S]*?)<\/update_current>/);
    const knowledgeMatch = aiResponseText.match(/<update_knowledge>([\s\S]*?)<\/update_knowledge>/);
    const memoryMatch = aiResponseText.match(/<update_memory>([\s\S]*?)<\/update_memory>/);
    const historyMatch = aiResponseText.match(/<update_history>([\s\S]*?)<\/update_history>/);
    const titleMatch = aiResponseText.match(/<update_title>([\s\S]*?)<\/update_title>/);

    if (currentMatch || knowledgeMatch || memoryMatch || historyMatch) reportUpdated = true;

    // チャット面を汚さないために特殊タグを除去
    let cleanResponseText = aiResponseText
      .replace(/<update_current>[\s\S]*?<\/update_current>/g, '')
      .replace(/<update_knowledge>[\s\S]*?<\/update_knowledge>/g, '')
      .replace(/<update_memory>[\s\S]*?<\/update_memory>/g, '')
      .replace(/<update_history>[\s\S]*?<\/update_history>/g, '')
      .replace(/<update_title>[\s\S]*?<\/update_title>/g, '')
      .trim();

    // ユーザーが生成待ちの間にプロジェクトを切り替えていなければ画面に直接反映
    if (callingProjectId === currentProjectId) {
      if (currentMatch) document.getElementById('pane-current').innerHTML = currentMatch[1].trim();
      if (knowledgeMatch) document.getElementById('pane-knowledge').innerHTML = knowledgeMatch[1].trim();
      if (memoryMatch) document.getElementById('pane-memory').innerHTML = memoryMatch[1].trim();
      if (historyMatch) document.getElementById('pane-history').innerHTML = historyMatch[1].trim();
      if (titleMatch) updateProjectName(currentProjectId, titleMatch[1].trim());

      if (reportUpdated) saveReportData();

      progressMsg.classList.remove('analyzing');
      let formattedText = cleanResponseText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      progressMsg.innerHTML = formattedText;

      chatLogs.push({ sender: 'ai', text: cleanResponseText, image: null });
      saveChatLogs();
      chatHistory.scrollTop = chatHistory.scrollHeight;
    } else {
      // 非アクティブプロジェクトへのバックグラウンド書き込み処理
      if (reportUpdated) {
        const repKey = `${REPORT_DATA_KEY}_${callingProjectId}`;
        const savedRep = JSON.parse(localStorage.getItem(repKey) || '{}');
        if (currentMatch) savedRep.current = currentMatch[1].trim();
        if (knowledgeMatch) savedRep.knowledge = knowledgeMatch[1].trim();
        if (memoryMatch) savedRep.memory = memoryMatch[1].trim();
        if (historyMatch) savedRep.history = historyMatch[1].trim();
        localStorage.setItem(repKey, JSON.stringify(savedRep));
      }
      if (titleMatch) {
        let projects = getLocalProjectsList();
        const proj = projects.find(p => p.id === callingProjectId);
        if (proj) {
          proj.name = titleMatch[1].trim();
          saveLocalProjectsList(projects);
          renderProjectsList();
        }
      }
      const logKey = `${CHAT_LOGS_KEY}_${callingProjectId}`;
      let origLogs = JSON.parse(localStorage.getItem(logKey) || '[]');
      origLogs.push({ sender: 'ai', text: cleanResponseText, image: null });
      localStorage.setItem(logKey, JSON.stringify(origLogs));
    }

  } catch (err) {
    if (callingProjectId === currentProjectId) {
      progressMsg.classList.remove('analyzing');
      progressMsg.style.border = "1px solid #ff0055";
      progressMsg.style.boxShadow = "0 0 10px rgba(255, 0, 85, 0.4)";
      progressMsg.style.backgroundColor = "rgba(255, 0, 85, 0.08)";
      progressMsg.style.color = "#ff66a3";
      progressMsg.textContent = `❌ エラー: ${err.message}`;
    }
  }
}

// =========================================================================
// 6. データ永続化・設定保存・JSONインポート／エクスポート
// =========================================================================
function applyAndCloseSettings() {
  saveSettings();
  closeSettings();
}

function saveSettings() {
  const chatAi = document.querySelector('input[name="chatAi"]:checked')?.value;
  const repSize = document.querySelector('input[name="repSize"]:checked')?.value;
  const apiKeyGemini = document.getElementById('apiKeyGemini')?.value.trim() || '';
  const apiKeyClaude = document.getElementById('apiKeyClaude')?.value.trim() || '';
  const apiKeyDeepSeek = document.getElementById('apiKeyDeepSeek')?.value.trim() || '';
  const apiKeyOpenAI = document.getElementById('apiKeyOpenAI')?.value.trim() || '';
  const personalMemory = document.getElementById('personalMemory')?.value.trim() || '';
  
  const settings = { chatAi, repSize, apiKeyGemini, apiKeyClaude, apiKeyDeepSeek, apiKeyOpenAI, personalMemory };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  
  if (repSize) {
    const reportSection = document.getElementById('reportSection');
    if (reportSection) reportSection.style.setProperty('--default-height', `${repSize}%`);
  }

  // クイックチェンジャーUIを同期
  if (window.updateAiQuickUI) window.updateAiQuickUI();
}

function saveChatLogs() {
  const MAX_MESSAGES = 80; 
  if (chatLogs.length > MAX_MESSAGES) {
    chatLogs = chatLogs.slice(-MAX_MESSAGES);
  }
  
  localStorage.setItem(getChatLogsKey(), JSON.stringify(chatLogs));
}

function saveReportData() {
  const reportData = {
    current: document.getElementById('pane-current').innerHTML,
    knowledge: document.getElementById('pane-knowledge').innerHTML,
    memory: document.getElementById('pane-memory').innerHTML,
    history: document.getElementById('pane-history').innerHTML
  };
  localStorage.setItem(getReportDataKey(), JSON.stringify(reportData));
}

function exportAllData() {
  const backup = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('life_report_')) {
      backup[key] = localStorage.getItem(key);
    }
  }
  
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `lifereport_backup_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importAllData(input) {
  const file = input.files[0];
  if (!file) return;
  
  if (!confirm("データをインポートしますか？\n現在アプリ内にある全てのデータ（履歴やメモリ）は上書きされます。")) {
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      const keys = Object.keys(data);
      
      if (keys.length === 0 || !keys.some(k => k.startsWith('life_report_'))) {
        alert("有効な LifeReport バックアップデータではありません。");
        return;
      }

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('life_report_')) {
          localStorage.removeItem(key);
        }
      }

      for (const key in data) {
        if (key.startsWith('life_report_')) {
          localStorage.setItem(key, data[key]);
        }
      }

      alert("データの復元が完了しました！最新の状態を反映するためにアプリを再起動します。");
      window.location.reload();

    } catch (err) {
      alert("ファイルのインポートに失敗しました: " + err.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function applyLoadedSettings(settings) {
  if (!settings) return;
  if (settings.chatAi) { const radio = document.querySelector(`input[name="chatAi"][value="${settings.chatAi}"]`); if (radio) radio.checked = true; }
  if (settings.repSize) { 
    const radio = document.querySelector(`input[name="repSize"][value="${settings.repSize}"]`); if (radio) radio.checked = true; 
    const reportSection = document.getElementById('reportSection');
    if (reportSection) reportSection.style.setProperty('--default-height', `${settings.repSize}%`); 
  }
  if (settings.apiKeyGemini) document.getElementById('apiKeyGemini').value = settings.apiKeyGemini;
  if (settings.apiKeyClaude) document.getElementById('apiKeyClaude').value = settings.apiKeyClaude;
  if (settings.apiKeyDeepSeek) document.getElementById('apiKeyDeepSeek').value = settings.apiKeyDeepSeek;
  if (settings.apiKeyOpenAI) document.getElementById('apiKeyOpenAI').value = settings.apiKeyOpenAI;
  
  const defaultText = "【全体共通の前提ルールやプロフィール】\n例：\n・職種：ITエンジニア\n・家族構成：5人家族\n・生活リズム：日曜と水曜にまとめ買い\n・AIへのルール：箇条書きを多めにして、要点をわかりやすく";
  let savedMemory = settings.personalMemory || '';
  
  if (savedMemory.trim() === defaultText.trim() || savedMemory.includes("【全体共通の前提ルールやプロフィール】")) {
    savedMemory = '';
  }
  
  document.getElementById('personalMemory').value = savedMemory;
  setPersonalMemoryPlaceholder();

  // クイックチェンジャーUIを同期
  if (window.updateAiQuickUI) window.updateAiQuickUI();
}

function setPersonalMemoryPlaceholder() {
  const defaultText = "【全体共通の前提ルールやプロフィール】\n例：\n・職種：ITエンジニア\n・家族構成：5人家族\n<td>・生活リズム：日曜と水曜にまとめ買い\n・AIへのルール：箇条書きを多めにして、要点をわかりやすく";
  const personalMemoryEl = document.getElementById('personalMemory');
  if (personalMemoryEl) {
    personalMemoryEl.placeholder = defaultText;
  }
}

function applyReportData(data) {
  if (!data) return;
  if (data.current) document.getElementById('pane-current').innerHTML = data.current;
  if (data.knowledge) document.getElementById('pane-knowledge').innerHTML = data.knowledge;
  if (data.memory) document.getElementById('pane-memory').innerHTML = data.memory;
  if (data.history) document.getElementById('pane-history').innerHTML = data.history;
}

// =========================================================================
// 7. アプリ初期ロードイベント & スワイプ制御 & 【NEW】UIダイナミックハック
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // --- 💡 [新機能] タブ開閉 ＆ AIモデルのインラインクイックチェンジャー用CSSを注入 ---
  const dynamicStyle = document.createElement('style');
  dynamicStyle.textContent = `
    /* サブタブボタンを隠す＆アニメーション用 */
    .lr-tab-hidden {
      display: none !important;
    }
    
    /* AIクイックコンテナの配置 */
    .ai-quick-container {
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
      vertical-align: middle;
    }
    
    .ai-trigger-btn {
      background: rgba(0, 243, 255, 0.05);
      color: #00f3ff;
      border: 1px solid rgba(0, 243, 255, 0.4);
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: bold;
      font-family: monospace;
      cursor: pointer;
      box-shadow: 0 0 8px rgba(0, 243, 255, 0.1);
      transition: all 0.2s;
    }
    
    .ai-trigger-btn:hover {
      background: rgba(0, 243, 255, 0.15);
      box-shadow: 0 0 12px rgba(0, 243, 255, 0.3);
    }
    
    .ai-quick-options {
      display: flex;
      gap: 4px;
      max-width: 0;
      opacity: 0;
      overflow: hidden;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      margin-left: 0;
    }
    
    .ai-quick-options.open {
      max-width: 400px;
      opacity: 1;
      margin-left: 6px;
    }
    
    .ai-opt-btn {
      background: #09131a;
      color: #8ab4f8;
      border: 1px solid #1a3a4a;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }
    
    .ai-opt-btn.active {
      background: rgba(182, 36, 255, 0.2);
      color: #b624ff;
      border-color: #b624ff;
      text-shadow: 0 0 4px rgba(182,36,255,0.5);
      box-shadow: 0 0 8px rgba(182, 36, 255, 0.3);
    }
  `;
  document.head.appendChild(dynamicStyle);

  // 最初期のデータ読み込み
  const savedUI = localStorage.getItem(STORAGE_KEY);
  if (savedUI) {
    applyLoadedSettings(JSON.parse(savedUI));
  } else {
    setPersonalMemoryPlaceholder(); 
  }

  // --- 💡 [新機能] タブトグル展開 ＆ AIクイックチェンジャー生成ロジック ---
  setTimeout(() => {
    // 全てのタブ切り替え用ボタン要素を検知
    const allTabButtons = Array.from(document.querySelectorAll('.tab-btn, button[onclick*="switchTab"]'));
    const currentBtn = allTabButtons.find(btn => btn.textContent.includes('Current') || btn.getAttribute('onclick')?.includes('current'));
    const otherTabs = allTabButtons.filter(btn => btn !== currentBtn);

    if (currentBtn) {
      // 1. 最初はCurrent以外のタブ（Knowledge, Memory, History）を非表示にする
      otherTabs.forEach(btn => btn.classList.add('lr-tab-hidden'));

      // Currentボタンがクリックされた時のトグル挙動を上書き＆バインド
      currentBtn.addEventListener('click', (e) => {
        // 現在、他のタブが開いているかどうかチェック
        const isAlreadyOpen = !otherTabs[0].classList.contains('lr-tab-hidden');
        if (isAlreadyOpen) {
          otherTabs.forEach(btn => btn.classList.add('lr-tab-hidden'));
        } else {
          otherTabs.forEach(btn => btn.classList.remove('lr-tab-hidden'));
        }
      });

      // 他のサブタブ（Knowledge等）を選択した瞬間に自動で閉じる
      otherTabs.forEach(btn => {
        btn.addEventListener('click', () => {
          otherTabs.forEach(b => b.classList.add('lr-tab-hidden'));
        });
      });

      // 2. AIモデルの都度切り替えボタン（インラインコンテナ）をCurrentのすぐ右側に動的生成
      const aiContainer = document.createElement('div');
      aiContainer.className = 'ai-quick-container';
      
      const aiTrigger = document.createElement('button');
      aiTrigger.className = 'ai-trigger-btn';
      aiTrigger.type = 'button';
      aiTrigger.textContent = '🤖 AI';
      
      const aiOptions = document.createElement('div');
      aiOptions.className = 'ai-quick-options';
      
      const models = [
        { id: 'gemini', name: 'Gemini' },
        { id: 'claude', name: 'Claude' },
        { id: 'deepseek', name: 'DeepSeek' },
        { id: 'openai', name: 'OpenAI' }
      ];
      
      models.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'ai-opt-btn';
        btn.type = 'button';
        btn.textContent = m.name;
        btn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          // 設定画面にあるオリジナルのラジオボタンを擬似クリックして連動
          const targetRadio = document.querySelector(`input[name="chatAi"][value="${m.id}"]`);
          if (targetRadio) {
            targetRadio.checked = true;
            saveSettings(); // ローカルストレージに即時保存
          }
          aiOptions.classList.remove('open');
        });
        aiOptions.appendChild(btn);
      });
      
      aiTrigger.addEventListener('click', (evt) => {
        evt.stopPropagation();
        aiOptions.classList.toggle('open');
      });
      
      // 画面のどこかをタップしたらメニューが閉じるお掃除処理
      document.addEventListener('click', () => {
        aiOptions.classList.remove('open');
      });
      
      aiContainer.appendChild(aiTrigger);
      aiContainer.appendChild(aiOptions);
      
      // Currentボタンの真右（次要素の前）にドロップイン
      currentBtn.parentNode.insertBefore(aiContainer, currentBtn.nextSibling);
      
      // クイックチェンジャーの表示状態を全自動で同期するグローバル関数化
      window.updateAiQuickUI = function() {
        const activeAiRadio = document.querySelector('input[name="chatAi"]:checked');
        const currentAi = activeAiRadio ? activeAiRadio.value : 'gemini';
        
        const currentModelObj = models.find(m => m.id === currentAi);
        aiTrigger.textContent = `🤖 ${currentModelObj ? currentModelObj.name : 'AI'}`;
        
        const optButtons = aiOptions.querySelectorAll('.ai-opt-btn');
        models.forEach((m, idx) => {
          if (m.id === currentAi) {
            optButtons[idx].classList.add('active');
          } else {
            optButtons[idx].classList.remove('active');
          }
        });
      };
      
      // 初回同期を実行
      window.updateAiQuickUI();
    }
  }, 100);

  // プロジェクト読み込み関連
  const projects = getLocalProjectsList();
  if (projects.length > 0) {
    const latest = projects[0];
    currentProjectId = latest.id;
    setActiveProjectUI(latest.id, latest.name);

    const savedReports = localStorage.getItem(getReportDataKey());
    if (savedReports) applyReportData(JSON.parse(savedReports));

    const savedLogs = localStorage.getItem(getChatLogsKey());
    if (savedLogs) {
      chatLogs = JSON.parse(savedLogs);
      if (chatHistory) {
        chatHistory.innerHTML = '';
        chatLogs.forEach(log => appendMessageToUI(log.sender, log.text, log.image));
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    } else {
      chatLogs = [];
      setDefaultInitialAIMessage();
    }
    renderProjectsList();
  } else {
    createNewProject();
  }

  // スワイプ判定
  const frame = document.querySelector('.phone-frame');
  if (frame) {
    let touchStartX = 0; let touchStartY = 0;
    frame.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, { passive: true });
    frame.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX; const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX; const diffY = touchEndY - touchStartY;
      const sheet = document.getElementById('bottomSheet');
      if (sheet && !sheet.classList.contains('open')) {
        if (touchStartX < 50 && diffX > 80 && Math.abs(diffY) < 60) toggleBottomSheet();
      }
    }, { passive: true });
  }
});
