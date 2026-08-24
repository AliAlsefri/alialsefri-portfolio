const root = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const langToggle = document.getElementById('langToggle');
const menuToggle = document.getElementById('menuToggle');
const nav = document.querySelector('.nav');

const savedTheme = localStorage.getItem('ali-theme');
if (savedTheme) root.dataset.theme = savedTheme;
else if (window.matchMedia('(prefers-color-scheme: light)').matches) root.dataset.theme = 'light';

themeToggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('ali-theme', next);
});

function setLanguage(lang) {
  const isArabic = lang === 'ar';
  root.lang = lang;
  root.dir = isArabic ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-en][data-ar]').forEach(el => {
    el.textContent = el.dataset[lang];
  });
  langToggle.textContent = isArabic ? 'EN' : 'عربي';
  localStorage.setItem('ali-lang', lang);
}
setLanguage(localStorage.getItem('ali-lang') || 'en');
langToggle.addEventListener('click', () => setLanguage(root.lang === 'en' ? 'ar' : 'en'));

menuToggle.addEventListener('click', () => nav.classList.toggle('open'));
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

const glow = document.querySelector('.cursor-glow');
window.addEventListener('pointermove', e => {
  glow.style.left = `${e.clientX}px`;
  glow.style.top = `${e.clientY}px`;
}, { passive: true });

const form = document.getElementById('contactForm');
const formStatus = document.getElementById('formStatus');
const contactEndpoint = 'https://ali-contact.alsefri.workers.dev/';

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const button = form.querySelector('button');
  const payload = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  formStatus.textContent = root.lang === 'ar' ? 'جاري الإرسال…' : 'Sending…';

  try {
    const response = await fetch(contactEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('contact_failed');

    form.reset();
    formStatus.textContent = root.lang === 'ar'
      ? 'تم إرسال رسالتك بنجاح — شكرًا لك.'
      : 'Your message was sent successfully — thank you.';
  } catch {
    formStatus.textContent = root.lang === 'ar'
      ? 'تعذر الإرسال الآن. تواصل معي عبر البريد مباشرة.'
      : 'Could not send right now. Please use the email link instead.';
  } finally {
    button.disabled = false;
  }
});

const currentYear = document.getElementById('currentYear');
if (currentYear) currentYear.textContent = new Date().getFullYear();

(() => {
  const cfg = window.ALI_AI_CONFIG || {};
  const launcher = document.getElementById('aliAiLauncher');
  const panel = document.getElementById('aliAiPanel');
  const closeBtn = document.getElementById('aliAiClose');
  const form = document.getElementById('aliAiForm');
  const input = document.getElementById('aliAiInput');
  const messages = document.getElementById('aliAiMessages');
  const suggestions = document.getElementById('aliAiSuggestions');
  const langToggle = document.getElementById('langToggle');

  if (!launcher || !panel || !form || !input || !messages) return;

  const history = [];
  let busy = false;

  const isConfigured = () => Boolean(cfg.endpoint && !cfg.endpoint.includes('YOUR-WORKER'));
  const currentLang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';

  function openChat() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus(), 40);
  }

  function closeChat() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
  }

  launcher.addEventListener('click', () => {
    if (panel.hidden) openChat();
    else closeChat();
  });

  closeBtn?.addEventListener('click', closeChat);

  function addMessage(role, text, extraClass = '') {
    const item = document.createElement('article');
    item.className = `ali-ai-message ${role} ${extraClass}`.trim();

    const bubble = document.createElement('div');
    bubble.className = 'ali-ai-bubble';
    bubble.textContent = text;

    item.appendChild(bubble);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;

    return { item, bubble };
  }

  function addThinking() {
    const item = document.createElement('article');
    item.className = 'ali-ai-message assistant thinking';

    const bubble = document.createElement('div');
    bubble.className = 'ali-ai-bubble';
    bubble.innerHTML = '<i></i><i></i><i></i>';

    item.appendChild(bubble);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;

    return item;
  }

  function decodeSseEvent(block) {
    const line = block.split('\n').find(l => l.startsWith('data:'));
    if (!line) return '';

    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') return '';

    try {
      const obj = JSON.parse(raw);
      return obj.text || obj.response || obj.choices?.[0]?.delta?.content || '';
    } catch {
      return '';
    }
  }

  async function streamAnswer(response, bubble) {
    const reader = response.body?.getReader();

    if (!reader) {
      bubble.textContent = await response.text();
      return bubble.textContent;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const chunk = decodeSseEvent(part);
        if (!chunk) continue;

        full += chunk;
        bubble.textContent = full;
        messages.scrollTop = messages.scrollHeight;
      }
    }

    return full.trim();
  }

  async function ask(question) {
    question = String(question || '').trim();
    if (!question || busy) return;

    openChat();
    addMessage('user', question);
    input.value = '';
    input.style.height = 'auto';

    if (!isConfigured()) {
      addMessage(
        'assistant',
        currentLang() === 'ar'
          ? 'الشات جاهز، لكن رابط خدمة Ali AI غير مضبوط بعد.'
          : 'The chat is ready, but the Ali AI service endpoint is not configured yet.'
      );
      return;
    }

    busy = true;
    const sendButton = form.querySelector('button');
    if (sendButton) sendButton.disabled = true;

    const thinking = addThinking();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs || 25000);

    try {
      const recent = history.slice(-6);

      const response = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          language: currentLang(),
          history: recent
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) {
        let detail = '';
        try {
          detail = (await response.json()).error || '';
        } catch {}
        throw new Error(detail || `HTTP ${response.status}`);
      }

      thinking.remove();
      const out = addMessage('assistant', '');

      let answer = '';

      if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
        answer = await streamAnswer(response, out.bubble);
      } else {
        const data = await response.json();
        answer = data.answer || data.response || '';
        out.bubble.textContent = answer;
      }

      if (!answer) {
        answer = currentLang() === 'ar'
          ? 'ما قدرت أطلع إجابة واضحة الآن. جرّب صياغة السؤال بطريقة ثانية.'
          : 'I could not produce a clear answer. Try asking in a different way.';
      }

      out.bubble.textContent = answer;

      history.push(
        { role: 'user', content: question },
        { role: 'assistant', content: answer }
      );

      if (history.length > 12) {
        history.splice(0, history.length - 12);
      }
    } catch (err) {
      clearTimeout(timer);
      thinking.remove();

      addMessage(
        'assistant',
        currentLang() === 'ar'
          ? 'صار تعليق بسيط في الاتصال 😅 جرّب مرة ثانية، وإذا استمرت المشكلة استخدم بيانات التواصل بالموقع.'
          : 'Tiny connection hiccup 😅 Please try again, or use the contact details on the site.'
      );
    } finally {
      busy = false;
      if (sendButton) sendButton.disabled = false;
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    ask(input.value);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(input.value);
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  });

  suggestions?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      ask(currentLang() === 'ar' ? btn.dataset.qAr : btn.dataset.qEn);
    });
  });

  function syncPlaceholder() {
    input.placeholder = currentLang() === 'ar' ? 'اسأل عن علي…' : 'Ask about Ali…';
  }

  syncPlaceholder();
  langToggle?.addEventListener('click', () => setTimeout(syncPlaceholder, 0));
})();
