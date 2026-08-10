(function(){
  var apiBase = 'https://api.example.com';
  var orgId = 'YOUR_ORG_ID';
  var iframeSrc = apiBase.replace(/^https?:\/\//,'https://') + '/widget?org_id=' + encodeURIComponent(orgId || '');
  var iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.style.border = '0';
  iframe.style.position = 'fixed';
  iframe.style.right = '20px';
  iframe.style.bottom = '20px';
  iframe.style.width = '420px';
  iframe.style.height = '560px';
  iframe.style.zIndex = '2147483647';
  iframe.id = 'upgrade-chat-widget-iframe';
  iframe.setAttribute('aria-hidden','false');
  iframe.title = 'Upgrade Chat';
  iframe.style.display = 'none';

  window.addEventListener('message', function(ev){
    try{
      var msg = ev.data || {};
      if(msg && msg.type === 'upgrade_chat_request_token'){
        iframe.contentWindow.postMessage({type:'auth.token', token: msg.token}, '*');
      }
    }catch(e){console.error(e)}
  }, false);

  var btn = document.createElement('button');
  btn.innerText = 'Chat';
  btn.id = 'upgrade-chat-toggle';
  btn.style.position = 'fixed';
  btn.style.right = '20px';
  btn.style.bottom = '20px';
  btn.style.zIndex = '2147483646';
  btn.style.padding = '10px 14px';
  btn.style.borderRadius = '8px';
  btn.style.background = '#0b74ff';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.cursor = 'pointer';
  btn.setAttribute('aria-expanded','false');
  var visible = false;
  btn.onclick = function(){
    visible = !visible;
    iframe.style.display = visible ? 'block' : 'none';
    btn.setAttribute('aria-expanded', String(visible));
    if(visible){
      try{ navigator.sendBeacon(apiBase + '/internal/telemetry', JSON.stringify({event:'chat.started', org_id: orgId, ts: new Date().toISOString()})); }catch(e){}
      fetch(apiBase + '/widget/token', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({org_id: orgId})})
        .then(function(r){ if(!r.ok) throw new Error('token fetch failed'); return r.json(); })
        .then(function(json){ if(json && json.token){ try{ iframe.contentWindow.postMessage({type:'auth.token', token: json.token}, '*'); }catch(e){} } })
        .catch(function(err){ console.error('token error', err); });
    }
  };
  function append(){ if(!document.body) return setTimeout(append,50); document.body.appendChild(iframe); document.body.appendChild(btn); }
  append();
})();
