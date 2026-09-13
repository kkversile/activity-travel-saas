type SwaggerDemoAccount = {
  key: string;
  label: string;
  role: string;
  email: string;
  password: string;
};

/**
 * Builds the small, demo-only control panel loaded beside Swagger UI.
 * Credentials come from deployment environment variables and are never stored
 * in source control. The panel is intentionally useful for a live walkthrough:
 * choose a persona, prefill the login payload, or login and authorize Swagger.
 */
export function createSwaggerDemoUiScript(serverUrl: string, accounts: SwaggerDemoAccount[]) {
  const config = JSON.stringify({ serverUrl: serverUrl.replace(/\/+$/, ''), accounts });
  return `(function () {
  'use strict';
  var config = ${config};
  var tokenKey = 'voya_swagger_access_token';
  var userKey = 'voya_swagger_demo_user';

  function addStyles() {
    if (document.getElementById('voya-swagger-demo-style')) return;
    var style = document.createElement('style');
    style.id = 'voya-swagger-demo-style';
    style.textContent = '.voya-swagger-demo{margin:18px 0;padding:16px 18px;border:1px solid #d9e2ec;border-radius:10px;background:linear-gradient(135deg,#f7fbff,#fff);font-family:Arial,sans-serif}.voya-swagger-demo h3{margin:0 0 5px;color:#14213d;font-size:17px}.voya-swagger-demo p{margin:0 0 12px;color:#52627a;font-size:12px}.voya-swagger-demo-grid{display:grid;grid-template-columns:minmax(180px,240px) minmax(250px,1fr);gap:12px;align-items:end}.voya-swagger-demo label{display:block;color:#52627a;font-size:11px;font-weight:700;margin-bottom:5px}.voya-swagger-demo select{width:100%;padding:9px;border:1px solid #c9d4e2;border-radius:6px;background:#fff}.voya-swagger-demo pre{margin:0;padding:10px 12px;min-height:60px;overflow:auto;border-radius:6px;background:#14213d;color:#e8f0f7;font:12px/1.45 Consolas,monospace}.voya-swagger-demo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.voya-swagger-demo button{border:1px solid #c9d4e2;border-radius:6px;padding:8px 12px;background:#fff;color:#14213d;font-weight:700;cursor:pointer}.voya-swagger-demo button.primary{background:#14213d;color:#fff;border-color:#14213d}.voya-swagger-demo button:disabled{opacity:.55;cursor:not-allowed}.voya-swagger-demo-status{margin-top:10px;min-height:16px;color:#2f855a;font-size:12px;font-weight:700}.voya-swagger-demo-status.error{color:#b42318}@media(max-width:700px){.voya-swagger-demo-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function currentAccount(select) {
    return config.accounts.find(function (account) { return account.key === select.value; }) || config.accounts[0];
  }

  function payloadFor(account) {
    return { email: account.email, password: account.password };
  }

  function setStatus(node, message, error) {
    node.textContent = message;
    node.className = 'voya-swagger-demo-status' + (error ? ' error' : '');
  }

  function loginOperation() {
    return document.querySelector('.swagger-ui .opblock[data-path="/api/auth/login"]');
  }

  function prefillLoginOperation(select, status) {
    var account = currentAccount(select);
    var operation = loginOperation();
    if (!operation) {
      setStatus(status, 'Login operation not mounted yet. Scroll to Authentication and try again.', true);
      return;
    }
    if (!operation.classList.contains('is-open')) {
      var summary = operation.querySelector('.opblock-summary');
      if (summary) summary.click();
    }
    window.setTimeout(function () {
      var tryButton = operation.querySelector('.try-out__btn');
      if (tryButton && /try it out/i.test(tryButton.textContent || '') ) tryButton.click();
      window.setTimeout(function () {
        var textarea = operation.querySelector('.body-param__text textarea, textarea');
        if (!textarea) {
          setStatus(status, 'Login opened, but the request body editor was not available yet.', true);
          return;
        }
        textarea.value = JSON.stringify(payloadFor(account), null, 2);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        operation.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setStatus(status, account.label + ' payload prefilled. Click Execute in the login operation.');
      }, 120);
    }, 80);
  }

  async function loginAndAuthorize(select, status, button) {
    var account = currentAccount(select);
    if (!account || !account.email || !account.password) {
      setStatus(status, 'Demo credentials are not configured for this deployment.', true);
      return;
    }
    button.disabled = true;
    setStatus(status, 'Signing in as ' + account.label + '...');
    try {
      var response = await fetch(config.serverUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFor(account))
      });
      var data = await response.json();
      if (!response.ok || !data.accessToken) throw new Error(data.message || 'Login failed');
      window.localStorage.setItem(tokenKey, data.accessToken);
      window.localStorage.setItem(userKey, JSON.stringify(data.user || { email: account.email, role: account.role }));
      try { if (window.ui && window.ui.preauthorizeApiKey) window.ui.preauthorizeApiKey('bearer', data.accessToken); } catch (_) {}
      setStatus(status, 'Authorized as ' + ((data.user && data.user.fullName) || account.label) + ' (' + account.role + '). Try it out is ready.');
    } catch (error) {
      setStatus(status, (error && error.message) || 'Login failed', true);
    } finally {
      button.disabled = false;
    }
  }

  function mount() {
    var root = document.querySelector('.swagger-ui');
    var info = document.querySelector('.swagger-ui .information-container');
    if (!root || !info || document.querySelector('.voya-swagger-demo')) return !!root;
    addStyles();
    var panel = document.createElement('section');
    panel.className = 'voya-swagger-demo';
    panel.innerHTML = '<h3>VOYA demo login</h3><p>Select a persona to generate the exact login payload, or login and authorize all protected requests.</p><div class="voya-swagger-demo-grid"><div><label for="voya-swagger-demo-role">User type</label><select id="voya-swagger-demo-role"></select></div><div><label>POST /api/auth/login payload</label><pre id="voya-swagger-demo-payload"></pre></div></div><div class="voya-swagger-demo-actions"><button id="voya-swagger-demo-prefill">Prefill login payload</button><button class="primary" id="voya-swagger-demo-login">Login + Authorize Swagger</button></div><div id="voya-swagger-demo-status" class="voya-swagger-demo-status"></div>';
    info.parentNode.insertBefore(panel, info.nextSibling);
    var select = panel.querySelector('#voya-swagger-demo-role');
    var payload = panel.querySelector('#voya-swagger-demo-payload');
    var status = panel.querySelector('#voya-swagger-demo-status');
    var prefill = panel.querySelector('#voya-swagger-demo-prefill');
    var login = panel.querySelector('#voya-swagger-demo-login');
    config.accounts.forEach(function (account) {
      var option = document.createElement('option');
      option.value = account.key;
      option.textContent = account.label + ' (' + account.role + ')';
      select.appendChild(option);
    });
    function refreshPayload() { payload.textContent = JSON.stringify(payloadFor(currentAccount(select)), null, 2); }
    select.addEventListener('change', function () { refreshPayload(); setStatus(status, 'Ready to prefill or login as ' + currentAccount(select).label + '.'); });
    prefill.addEventListener('click', function () { prefillLoginOperation(select, status); });
    login.addEventListener('click', function () { loginAndAuthorize(select, status, login); });
    refreshPayload();
    setStatus(status, config.accounts.some(function (account) { return !!account.password; }) ? 'Demo credentials loaded from deployment configuration.' : 'Demo credentials are not configured for this deployment.', !config.accounts.some(function (account) { return !!account.password; }));
    return true;
  }

  var attempts = 0;
  var timer = window.setInterval(function () {
    attempts += 1;
    if (mount() || attempts > 120) window.clearInterval(timer);
  }, 250);
})();`;
}
