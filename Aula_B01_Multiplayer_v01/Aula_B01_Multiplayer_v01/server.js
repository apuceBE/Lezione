/**
 * CORSO META QUEST 3 – CRUSCOTTO AUTOMATICO
 * Incollare QUESTO codice in un NUOVO file .gs dello STESSO progetto Apps Script.
 * NON rieseguire creaModuloValutazioneMetaQuest3(): creerebbe duplicati.
 * Eseguire una sola volta installaCruscottoMetaQuest3().
 * La funzione aggiornaCruscottoMetaQuest3() può essere eseguita quando si vuole.
 */
const MQ3 = {
  // ID del Google Sheets corretto: quello aperto dal pulsante «Visualizza in Fogli» del modulo.
  // Se l'ID non corrisponde, sostituirlo con la parte tra /d/ e /edit nell'URL del foglio.
  spreadsheetId: '1Adwn-Si_ZstEUpb03kS3tWkUCzNE0-9ot-KzBXfD-Rc',
  dashboard: 'CRUSCOTTO', detail: 'DETTAGLIO', groups: 'GRUPPI', config: 'CONFIG_CRUSCOTTO'
};

function installaCruscottoMetaQuest3() {
  const ss = SpreadsheetApp.openById(MQ3.spreadsheetId);
  const sh = mq3TrovaRisposte_(ss);
  if (!sh) throw new Error('Foglio risposte non trovato. Verifica l’ID in MQ3.spreadsheetId e le intestazioni della riga 1.');
  const config = mq3GetSheet_(ss, MQ3.config);
  if (!config.getRange('A1').getValue()) {
    config.getRange('A1:B7').setValues([
      ['CONFIGURAZIONE CRUSCOTTO', ''],
      ['Fonte risposte', sh.getName()],
      ['Aggiornamento', 'Automatico a ogni invio + manuale dal menu Meta Quest 3'],
      ['Esclusione prove', 'Inserire in A10:A il valore della colonna A (timestamp) delle risposte da escludere'],
      ['Come escludere', 'Copiare la cella A2 del foglio risposte e incollarla in A10, senza riscriverla'],
      ['Note', 'Non modificare o ordinare le colonne del foglio risposte'],
      ['Criterio', 'Indici calcolati solo su risposte valide, non escluse']
    ]);
    config.getRange('A9').setValue('TIMESTAMP DELLE RISPOSTE DA ESCLUDERE');
    config.getRange('A1:B1').setFontWeight('bold').setBackground('#dce6f1');
    config.getRange('A9').setFontWeight('bold').setBackground('#fff2cc');
    config.setColumnWidth(1, 330); config.setColumnWidth(2, 720);
    config.setFrozenRows(1);
  }
  config.getRange('A10:A1000').setNumberFormat(sh.getRange('A2').getNumberFormat());
  // Installa un solo trigger automatico per questo progetto.
  const handler = 'aggiornaCruscottoMetaQuest3';
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(handler).forSpreadsheet(ss).onFormSubmit().create();
  aggiornaCruscottoMetaQuest3();
  Logger.log('Cruscotto creato: ' + ss.getUrl());
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Meta Quest 3')
    .addItem('Aggiorna cruscotto', 'aggiornaCruscottoMetaQuest3')
    .addToUi();
}

function aggiornaCruscottoMetaQuest3() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const ss = SpreadsheetApp.openById(MQ3.spreadsheetId);
    const src = mq3TrovaRisposte_(ss);
    if (!src) throw new Error('Foglio risposte non trovato.');
    const raw = src.getDataRange().getValues();
    const display = src.getDataRange().getDisplayValues();
    const header = raw[0].map(String);
    const ix = n => header.findIndex(h => new RegExp('^\\s*0?' + n + '\\.').test(h));
    const required = [1,2,4,7,8,9,10,11,12,13,14,15,16,17,25,26];
    const missing = required.filter(n => ix(n) < 0);
    if (missing.length) throw new Error('Colonne mancanti nel foglio risposte: ' + missing.join(', '));
    const cfg = mq3GetSheet_(ss, MQ3.config);
    const excluded = new Set(cfg.getRange(10, 1, Math.max(1, cfg.getLastRow()-9), 1)
      .getDisplayValues().flat().map(s=>String(s).trim()).filter(Boolean));
    const details = [], groupMap = new Map(), softwareMap = new Map();
    let excludedCount = 0;
    for (let r = 1; r < raw.length; r++) {
      const v = raw[r], shown = display[r];
      if (!v[0] || !v[ix(4)]) continue;
      if (excluded.has(String(shown[0]).trim())) { excludedCount++; continue; }
      const group = String(v[ix(1)] || '').trim();
      const teacher = String(v[ix(2)] || '').trim();
      const software = String(v[ix(4)] || '').trim();
      const nums = (from,to) => {
        const a=[]; for(let k=from;k<=to;k++) { const n=Number(v[ix(k)]); if(Number.isFinite(n)&&n>=1&&n<=5)a.push(n); }
        return a.length===to-from+1 ? a.reduce((x,y)=>x+y,0)/a.length : null;
      };
      const technical = nums(7,11), didactic = nums(12,17);
      const overall = Number(v[ix(25)]);
      const score = overall>=1 && overall<=5 ? overall : null;
      const recommendation = String(v[ix(26)]||'');
      details.push([shown[0],group,teacher,software,technical,didactic,score,recommendation]);
      mq3Add_(softwareMap, software, technical, didactic, score, recommendation);
      mq3Add_(groupMap, group, technical, didactic, score, recommendation);
    }
    const detail = mq3GetSheet_(ss,MQ3.detail);
    detail.clear();
    const dh=['Data invio','Gruppo','Docente','Software','Indice tecnico (1–5)','Indice didattico (1–5)','Giudizio (1–5)','Raccomandazione'];
    detail.getRange(1,1,1,dh.length).setValues([dh]);
    if(details.length) detail.getRange(2,1,details.length,dh.length).setValues(details);
    mq3Style_(detail,dh.length); detail.getRange('E2:G').setNumberFormat('0.00');
    const softwareRows=mq3Rows_(softwareMap);
    const groupsRows=mq3Rows_(groupMap);
    const groups=mq3GetSheet_(ss,MQ3.groups);
    groups.clear();
    const gh=['Gruppo','Valutazioni','Tecnico medio','Didattico medio','Giudizio medio','Sì','Sì, con adattamenti','No','Da approfondire'];
    groups.getRange(1,1,1,gh.length).setValues([gh]);
    if(groupsRows.length) groups.getRange(2,1,groupsRows.length,gh.length).setValues(groupsRows);
    mq3Style_(groups,gh.length); groups.getRange('C2:E').setNumberFormat('0.00');
    const dash=mq3GetSheet_(ss,MQ3.dashboard);
    dash.clear(); dash.getCharts().forEach(c=>dash.removeChart(c));
    dash.getRange('A1').setValue('META QUEST 3 | CRUSCOTTO SOFTWARE DIDATTICI');
    dash.getRange('A1:I1').merge().setBackground('#253858').setFontColor('#ffffff').setFontWeight('bold').setFontSize(15);
    dash.getRange('A3:B8').setValues([
      ['Risposte totali ricevute', Math.max(0,raw.length-1)],
      ['Risposte escluse', excludedCount],
      ['Valutazioni considerate', details.length],
      ['Software valutati', softwareRows.length],
      ['Gruppi con risposte', groupsRows.length],
      ['Ultimo aggiornamento', new Date()]
    ]);
    dash.getRange('A3:A8').setFontWeight('bold'); dash.getRange('B8').setNumberFormat('dd/MM/yyyy HH:mm');
    dash.getRange('A10').setValue('GRADUATORIA SOFTWARE (ordinata per indice didattico)');
    dash.getRange('A10:I10').merge().setBackground('#dce6f1').setFontWeight('bold');
    const h=['Software','Valutazioni','Tecnico medio','Didattico medio','Giudizio medio','Sì','Sì, con adattamenti','No','Da approfondire'];
    dash.getRange(11,1,1,h.length).setValues([h]);
    if(softwareRows.length) dash.getRange(12,1,softwareRows.length,h.length).setValues(softwareRows);
    dash.getRange('A11:I11').setFontWeight('bold').setBackground('#e9eef5');
    dash.getRange('C12:E').setNumberFormat('0.00');
    dash.setFrozenRows(1);
    dash.setColumnWidth(1,330);
    for(let c=2;c<=9;c++)dash.setColumnWidth(c,135);
    dash.getRange('A'+(14+softwareRows.length)).setValue('Nota: graduatoria descrittiva; pochi questionari non costituiscono una validazione statistica.');
    dash.getRange('A'+(15+softwareRows.length)).setValue('Le prove escluse sono elencate in CONFIG_CRUSCOTTO, dalla cella A10.');
    if(softwareRows.length) {
      const chart=dash.newChart().setChartType(Charts.ChartType.BAR)
        .addRange(dash.getRange(11,1,softwareRows.length+1,1))
        .addRange(dash.getRange(11,4,softwareRows.length+1,1))
        .setOption('title','Indice didattico medio per software (1–5)')
        .setOption('legend',{position:'none'})
        .setOption('hAxis',{viewWindow:{min:0,max:5}})
        .setPosition(11,11,0,0).build();
      dash.insertChart(chart);
    }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function mq3TrovaRisposte_(ss) {
  return ss.getSheets().find(s=>{
    if(s.getLastRow()<1||s.getLastColumn()<8)return false;
    const h=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].join(' | ');
    return /Informazioni cronologiche|Timestamp/i.test(h) && /01\. Gruppo di lavoro/.test(h) && /04\. Software valutato/.test(h);
  }) || null;
}
function mq3GetSheet_(ss,name) {return ss.getSheetByName(name)||ss.insertSheet(name);}
function mq3Add_(map,key,tech,did,overall,rec) {
  if(!map.has(key))map.set(key,{n:0,t:[],d:[],o:[],yes:0,adapt:0,no:0,check:0});
  const a=map.get(key);a.n++;
  if(tech!==null)a.t.push(tech);if(did!==null)a.d.push(did);if(overall!==null)a.o.push(overall);
  if(rec==='Sì')a.yes++;else if(rec==='Sì, con adattamenti')a.adapt++;
  else if(rec==='No')a.no++;else if(rec==='Da approfondire')a.check++;
}
function mq3Rows_(map) {
  const mean=a=>a.length ? a.reduce((x,y)=>x+y,0)/a.length : '';
  return [...map.entries()].map(([key,v])=>[key,v.n,mean(v.t),mean(v.d),mean(v.o),v.yes,v.adapt,v.no,v.check])
    .sort((a,b)=>(Number(b[3])||0)-(Number(a[3])||0)||b[1]-a[1]);
}
function mq3Style_(sh,width) {
  sh.getRange(1,1,1,width).setFontWeight('bold').setFontColor('white').setBackground('#253858');
  sh.setFrozenRows(1);sh.setColumnWidth(1,260);
  for(let c=2;c<=width;c++)sh.setColumnWidth(c,160);
}

