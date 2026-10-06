(() => {
  const $=id=>document.getElementById(id),dialog=$("notification-dialog");
  const url="https://ikbksrbvfvflgodmookv.supabase.co/functions/v1/notifications-v2";
  const vapid="BBiQhBO4vUJKdjdJ8_3ydmOEuvw1hzCOkah6_PslWBuX7po8klhwurIpmjrNq_FD2byuY52sn8kLai9h9gHRAmM";
  const types={meal:"🍽️ Comidas",event:"🚩 Eventos",glucose:"🩸 Glucemias",medication:"💊 Medicamentos",reminder:"⏰ Recordatorios programados"};
  let subscription=null,preferences={},reminders=[],busy=false,settingsLoaded=false,editId=null,pendingId=null;
  const status=message=>$("push-status").textContent=message;
  const supported=()=>isSecureContext&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
  function lock(value){busy=value;dialog.querySelectorAll("button:not([data-close-notifications]),input,select").forEach(n=>n.disabled=value);$("notification-settings").disabled=value||!subscription||!settingsLoaded;$("reminder-fields").disabled=value||!subscription||!settingsLoaded;}
  async function registration(){return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error("No se pudo iniciar la app. Actualiza la página con conexión.")),10000))]);}
  async function api(body){
    const identity=await getCloudIdentity(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-glucose-key":identity.token},body:JSON.stringify({endpoint:subscription?.endpoint,...body}),signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||"No se pudo guardar.");return data;}
    catch(e){if(e.name==="AbortError"||e instanceof TypeError)throw new Error("No se pudo confirmar el guardado. Revisa la conexión y vuelve a intentarlo.");throw e;}finally{clearTimeout(timer);}
  }
  async function action(fn){if(busy)return;lock(true);try{await fn();}catch(e){status(e.message);}finally{lock(false);}}
  function switches(){for(const k in types)$("notify-"+k).checked=!!preferences[k];}
  function render(){
    $("push-enable").hidden=!!subscription||!supported()||Notification.permission==="denied";
    $("push-test").hidden=$("push-disable").hidden=!subscription;
    switches();const list=$("reminder-list");list.replaceChildren();
    $("reminder-empty").hidden=reminders.length>0;
    for(const r of reminders){
      const row=document.createElement("article");row.className="reminder-item";
      const info=document.createElement("div"),title=document.createElement("strong"),detail=document.createElement("p");
      title.textContent=r.title;detail.className="small muted";
      detail.textContent=`${types[r.kind]} · ${r.repeat_daily?"Todos los días":"Una vez"} · ${r.local_time.slice(0,5)}${r.enabled?" · Próximo: "+new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(r.next_run)):" · Programación finalizada"}`;
      info.append(title,detail);const actions=document.createElement("div");actions.className="push-actions";
      const edit=document.createElement("button");edit.type="button";edit.className="now-button";edit.textContent="Editar";edit.setAttribute("aria-label","Editar "+r.title);
      edit.onclick=()=>{editId=r.id;pendingId=null;$("reminder-title").value=r.title;$("reminder-kind").value=r.kind;$("reminder-date").value=localDateKey(r.next_run);$("reminder-time").value=r.local_time.slice(0,5);$("reminder-repeat").value=r.repeat_daily?"daily":"once";$("reminder-save").textContent="Guardar cambios";$("reminder-cancel").hidden=false;updateOccurrence();$("reminder-title").focus();};
      const del=document.createElement("button");del.type="button";del.className="danger";del.textContent="Eliminar";del.setAttribute("aria-label","Eliminar "+r.title);
      del.onclick=()=>action(async()=>{if(!confirm("¿Eliminar este recordatorio?"))return;await api({action:"delete_reminder",id:r.id});if(editId===r.id)reset();await load();status("Recordatorio eliminado.");});
      actions.append(edit,del);row.append(info,actions);list.append(row);
    }
  }
  async function load(){const data=await api({action:"settings"});preferences=data.preferences;reminders=data.reminders;settingsLoaded=true;render();}
  async function refresh(){
    if(!supported()){status("Para recibir notificaciones en iPhone, añade esta página a la pantalla de inicio y ábrela desde su icono (iOS 16.4 o posterior). En otros dispositivos, usa un navegador compatible y HTTPS.");render();return;}
    const reg=await registration();subscription=await reg.pushManager.getSubscription();
    if(subscription&&Notification.permission==="granted"){
      await api({action:"subscribe",subscription:subscription.toJSON(),userAgent:navigator.userAgent});await load();status("✓ Notificaciones activadas en este dispositivo.");
    }else{subscription=null;render();status(Notification.permission==="denied"?"Las notificaciones están bloqueadas. Actívalas en los ajustes del dispositivo.":"Activa las notificaciones para elegir avisos y programar recordatorios.");}
  }
  $("notification-bell").onclick=()=>{dialog.showModal();action(refresh);};
  dialog.querySelectorAll("[data-close-notifications]").forEach(b=>b.onclick=()=>dialog.close());
  $("push-enable").onclick=()=>action(async()=>{
    if(!supported())throw new Error("Abre la app instalada desde la pantalla de inicio.");
    if(await Notification.requestPermission()!=="granted")throw new Error("No se concedió permiso para las notificaciones.");
    const reg=await registration();subscription=await reg.pushManager.getSubscription();
    if(!subscription){const raw=atob(vapid.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-vapid.length%4)%4));subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
    await api({action:"subscribe",subscription:subscription.toJSON(),userAgent:navigator.userAgent});await load();status("✓ Notificaciones activadas en este dispositivo.");
  });
  $("push-test").onclick=()=>action(async()=>{await api({action:"test"});status("✓ Prueba enviada a este dispositivo.");});
  $("push-disable").onclick=()=>action(async()=>{
    if(!confirm("¿Desactivar las notificaciones y eliminar los recordatorios de este dispositivo?"))return;
    await api({action:"unsubscribe"});await subscription.unsubscribe();subscription=null;reminders=[];preferences={};reset();render();status("Notificaciones desactivadas en este dispositivo.");
  });
  for(const k in types)$("notify-"+k).onchange=()=>action(async()=>{
    const next={...preferences,[k]:$("notify-"+k).checked};
    try{await api({action:"preferences",preferences:next});preferences=next;status("Preferencias guardadas para este dispositivo.");}finally{switches();}
  });
  function updateOccurrence(){
    const times=chileWallCandidates($("reminder-date").value,$("reminder-time").value),select=$("reminder-occurrence");select.replaceChildren();
    times.forEach((timestamp,i)=>{const option=document.createElement("option");option.value=String(timestamp);option.textContent=`${i+1}ª ocurrencia · UTC${new Intl.DateTimeFormat("en",{timeZone:"America/Santiago",timeZoneName:"shortOffset"}).formatToParts(timestamp).find(p=>p.type==="timeZoneName").value.replace("GMT","")}`;select.append(option);});
    $("reminder-occurrence-wrap").hidden=times.length<2;
  }
  function reset(){editId=null;pendingId=null;$("reminder-form").reset();const soon=new Date(Date.now()+5*60000);$("reminder-date").value=localDateKey(soon);$("reminder-time").value=localTime(soon);$("reminder-save").textContent="Guardar recordatorio";$("reminder-cancel").hidden=true;updateOccurrence();}
  $("reminder-date").onchange=$("reminder-time").onchange=updateOccurrence;
  $("reminder-cancel").onclick=reset;
  $("reminder-form").onsubmit=e=>{e.preventDefault();action(async()=>{
    if(!subscription)throw new Error("Activa primero las notificaciones.");
    const times=chileWallCandidates($("reminder-date").value,$("reminder-time").value);
    if(!times.length)throw new Error("Esa fecha u hora no existe en Chile. Elige otra.");
    const time=times.length>1?Number($("reminder-occurrence").value):times[0];
    if(time<=Date.now()+10000)throw new Error("Elige una fecha y hora futuras.");
    pendingId=editId||pendingId||crypto.randomUUID();
    await api({action:"save_reminder",reminder:{id:pendingId,title:$("reminder-title").value.trim(),kind:$("reminder-kind").value,next_run:new Date(time).toISOString(),local_time:$("reminder-time").value,repeat_daily:$("reminder-repeat").value==="daily"}});
    reset();await load();status(preferences.reminder?"✓ Recordatorio programado en hora de Chile.":"Recordatorio guardado. Activa «Recordatorios programados» para recibirlo.");
  });};
  reset();lock(false);
})();
