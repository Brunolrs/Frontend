// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = "https://fcnjpdzxqceenfsprrvw.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmpwZHp4cWNlZW5mc3BycnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjQxNTAsImV4cCI6MjA4Mzk0MDE1MH0.da-1snEhvQjT3sbQ0vt-DQcmm-D-RzlQzgzkE0VdJpM";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DATA LAYER ---
const Data = {
  async getAtletas() { 
    const { data } = await supabaseClient.from('atletas').select('*'); 
    return data || []; 
  },
  async getConfigs() { 
    const { data } = await supabaseClient.from('workout_config').select('*').order('ordem', {ascending: true}); 
    return data || []; 
  },
  async updateConfig(id, updates) { 
    const { error } = await supabaseClient.from('workout_config').update(updates).eq('id', id); 
    if(error) alert("Erro ao salvar: " + error.message); else alert("Salvo!");
  },
  async addConfig(config) {
    const { error } = await supabaseClient.from('workout_config').insert([config]);
    return error;
  },
  async deleteConfig(id) {
    const { error } = await supabaseClient.from('workout_config').delete().eq('id', id);
    return error;
  },
  async getAtletaById(id) { 
    const { data } = await supabaseClient.from('atletas').select('*').eq('id', id).single(); 
    return data; 
  },
  async updateAtleta(id, updates) { 
    const response = await supabaseClient.from('atletas').update(updates).eq('id', id); 
    return response;
  },
  async addAtleta(atleta) { 
    const { error } = await supabaseClient.from('atletas').insert([atleta]); 
    return error; 
  },
  async deleteAtleta(id) { 
    await supabaseClient.from('atletas').delete().eq('id', id); 
  }
};

// --- CÁLCULOS (LÓGICA DE HIERARQUIA ADICIONADA) ---
const Calc = {
  getIdade(d) { if(!d)return 0; const p=d.includes('/')?d.split('/'):d.split('-'); const y=d.includes('/')?p[2]:p[0]; return new Date().getFullYear()-Number(y); },
  getFaixa(i) { if(i<25)return "Até 24"; if(i<=29)return "25–29"; if(i<=34)return "30–34"; if(i<=39)return "35–39"; return "40+"; },
  
  // Define o peso de cada categoria para ordenação
  getTier(w) { 
    if(!w) return 1; 
    const t = String(w).toUpperCase().trim();
    if(t === "RX") return 3;      // Maior peso
    if(t === "SCALE") return 2;   // Peso médio
    return 1;                     // Foundation (Peso menor)
  },
  
  getCategoriaLabel(res) { 
    if(res.some(r=> String(r.workout).toUpperCase() === "RX")) return "RX"; 
    if(res.some(r=> String(r.workout).toUpperCase() === "SCALE")) return "SCALE"; 
    return "FOUNDATION"; 
  },
  
  isTime(v) { return String(v).includes(':'); },
  parseScore(v) { 
    if(!v)return 0; const s=String(v); if(s.includes(':')){ const[m,sc]=s.split(':').map(Number); return (m*60)+sc; } return Number(s); 
  }
};

// --- UI ---
const UI = {
  atletasCache: [],
  configsCache: [],

  async init() {
    this.configsCache = await Data.getConfigs(); 

    if (document.getElementById("listaInscritos")) await this.renderInscritos();
    if (document.getElementById("buscaAtleta")) await this.initResultados();
    if (document.getElementById("ranking")) await this.renderRanking();
    
    this.renderOptionsRodada(); 
    if (document.getElementById("configList")) await this.renderConfigWorkouts();

    const selRodada = document.getElementById("rodada");
    if(selRodada) {
        selRodada.addEventListener("change", () => this.verificarPrazo());
        setTimeout(() => this.verificarPrazo(), 500); 
    }
  },

  // --- RANKING (COM CORREÇÃO DE HIERARQUIA) ---
  renderRankingHeader(configs) {
    const h = document.querySelector(".list-header.grid-ranking");
    if(!h) return;
    const gridStyle = `50px 2fr repeat(${configs.length}, minmax(80px, 1fr)) 70px`;
    h.style.setProperty('--grid-cols', gridStyle);
    let html = `<div>Rank</div><div style="text-align:left">Atleta</div>`;
    configs.forEach(c => html += `<div class="wod-col-header" style="color:var(--btn-primary)">${c.nome || `26.${c.id}`}</div>`);
    html += `<div>POINTS</div>`;
    h.innerHTML = html;
    return gridStyle;
  },

  async renderRanking() {
    const container = document.getElementById("ranking");
    if(!container) return;
    container.innerHTML = "<p style='text-align:center; padding:20px;'>Calculando pontuação...</p>";

    const configs = this.configsCache;
    const gridStyle = this.renderRankingHeader(configs);
    const fFaixa = document.getElementById("faixaFiltro").value;
    const fSexo = document.getElementById("sexoFiltro").value;
    let atletas = await Data.getAtletas();

    atletas = atletas.filter(a => {
        const faixa = a.faixa_etaria || a.faixaEtaria;
        return (fFaixa === "GERAL" || faixa === fFaixa) && (fSexo === "TODOS" || a.sexo === fSexo);
    });

    const activeWods = new Set();
    atletas.forEach(a => a.resultados?.forEach(r => activeWods.add(r.rodada)));

    // CÁLCULO DE CADA WOD
    configs.forEach(conf => {
        if (!activeWods.has(conf.id)) return;

        let participantes = atletas.filter(a => a.resultados && a.resultados.find(r => r.rodada === conf.id));
        
        participantes.sort((a, b) => {
            const resA = a.resultados.find(r => r.rodada === conf.id);
            const resB = b.resultados.find(r => r.rodada === conf.id);

            // 1. HIERARQUIA DE CATEGORIA (RX > SCALE > FOUNDATION)
            const tierA = Calc.getTier(resA.workout);
            const tierB = Calc.getTier(resB.workout);
            
            // Se categorias são diferentes, a maior ganha (descendente)
            if (tierA !== tierB) return tierB - tierA; 

            // 2. DESEMPATE POR RESULTADO (CATEGORIAS IGUAIS)
            const valA = Calc.parseScore(resA.score);
            const valB = Calc.parseScore(resB.score);

            if (conf.tipo === 'TIME') {
                const isTimeA = Calc.isTime(resA.score); 
                const isTimeB = Calc.isTime(resB.score);
                
                // Quem tem Tempo ganha de quem tem Reps (Cap)
                if (isTimeA && !isTimeB) return -1; 
                if (!isTimeA && isTimeB) return 1;
                
                // Ambos Tempo: Menor ganha
                if (isTimeA && isTimeB) return valA - valB;
                
                // Ambos Reps: Maior ganha
                return valB - valA; 
            }
            // Reps ou Carga: Maior valor ganha
            return valB - valA; 
        });

        // Distribuir Pontos
        for (let i = 0; i < participantes.length; i++) {
            const p = participantes[i];
            if(!p.pontosWod) p.pontosWod = {};

            // Empate real (mesma categoria E mesmo score)
            if (i > 0) {
                const prevP = participantes[i-1];
                const resCur = p.resultados.find(r => r.rodada === conf.id);
                const resPrev = prevP.resultados.find(r => r.rodada === conf.id);
                
                if (Calc.getTier(resCur.workout) === Calc.getTier(resPrev.workout) &&
                    Calc.isTime(resCur.score) === Calc.isTime(resPrev.score) &&
                    Calc.parseScore(resCur.score) === Calc.parseScore(resPrev.score)) {
                    p.pontosWod[conf.id] = prevP.pontosWod[conf.id];
                    continue; 
                }
            }
            p.pontosWod[conf.id] = i + 1;
        }

        // Penalidade (Último + 5)
        const penalidade = atletas.length + 5; 
        atletas.forEach(a => {
            if(!a.pontosWod) a.pontosWod = {};
            if (!a.pontosWod[conf.id]) a.pontosWod[conf.id] = penalidade;
        });
    });

    // ORDENAÇÃO GERAL DO LEADERBOARD
    atletas.sort((a, b) => {
        // 1. Soma dos Tiers (Quem fez mais RX fica em cima)
        let tierSumA = 0, tierSumB = 0;
        let pointsA = 0, pointsB = 0;

        configs.forEach(c => {
            const rA = a.resultados?.find(r => r.rodada === c.id);
            const rB = b.resultados?.find(r => r.rodada === c.id);
            tierSumA += rA ? Calc.getTier(rA.workout) : 0;
            tierSumB += rB ? Calc.getTier(rB.workout) : 0;
            pointsA += (a.pontosWod?.[c.id] || 0);
            pointsB += (b.pontosWod?.[c.id] || 0);
        });

        // Desempate Global: Quem fez mais provas na categoria superior ganha
        if (tierSumA !== tierSumB) return tierSumB - tierSumA;

        // Se categorias iguais, menor pontuação vence
        if (pointsA !== pointsB) return pointsA - pointsB;

        // Tie Break: Melhores posições individuais
        const ranksA = configs.map(c => a.pontosWod?.[c.id] || 999).sort((x,y)=>x-y);
        const ranksB = configs.map(c => b.pontosWod?.[c.id] || 999).sort((x,y)=>x-y);
        for(let i=0; i < ranksA.length; i++) {
            if (ranksA[i] !== ranksB[i]) return ranksA[i] - ranksB[i];
        }
        return 0;
    });

    // RENDERIZAR
    container.innerHTML = "";
    const penalidadeRef = atletas.length + 5;

    atletas.forEach((a, idx) => {
        const medalha = (idx+1) === 1 ? "🥇" : (idx+1) === 2 ? "🥈" : (idx+1) === 3 ? "🥉" : `${idx+1}º`;
        const res = a.resultados || [];
        
        let total = 0;
        configs.forEach(c => { if(activeWods.has(c.id)) total += (a.pontosWod?.[c.id]||0); });

        let colsHTML = "";
        let detailsHTML = "";
        
        configs.forEach(c => {
            const label = c.nome || `26.${c.id}`;
            const wodInfo = this.getWodInfo(res, c.id);
            const pt = this.fmtPt(a.pontosWod?.[c.id], penalidadeRef);
            colsHTML += `<div class="wod-col">${wodInfo} <span class="pts-wod">${pt}</span></div>`;
            detailsHTML += `<div class="detalhe-box"><span>${label}</span> ${wodInfo}</div>`;
        });

        container.innerHTML += `
        <div class="list-item grid-ranking" style="--grid-cols: ${gridStyle}" onclick="UI.toggleRankDetails(${a.id})">
          <div class="posicao">${medalha}</div>
          <div class="text-left nome-col">
            <strong>${a.nome}</strong> 
            <br><small style="opacity:0.7">${a.sexo} • ${a.faixa_etaria} • ${Calc.getCategoriaLabel(res)}</small>
          </div>
          ${colsHTML}
          <div class="score-highlight">${total} <small>pts</small></div>
        </div>
        <div id="detalhes-${a.id}" class="ranking-details" style="display:none;">
            ${detailsHTML}
        </div>`;
    });
  },

  // --- OUTRAS FUNÇÕES ---
  toggleEdit(id, modo) { 
    const campos = ["nome", "sexo", "nasc"];
    campos.forEach(c => { const el = document.getElementById(`${c}-${id}`); if(el) { el.disabled = !modo; if(modo) { el.classList.add("input-editavel"); if(c==="nome") el.focus(); } else { el.classList.remove("input-editavel"); } } });
    const btn = document.getElementById(`sv-${id}`); if(btn) btn.style.display = modo ? "inline-block" : "none"; 
  },
  async salvarEdicao(id) { const nome=document.getElementById(`nome-${id}`).value, sexo=document.getElementById(`sexo-${id}`).value, nasc=document.getElementById(`nasc-${id}`).value; if(!nome||!nasc)return alert("Preencha tudo"); const di=this.formatarDataParaBanco(nasc); const faixa=Calc.getFaixa(Calc.getIdade(di)); const btn=document.getElementById(`sv-${id}`); const org=btn.textContent; btn.textContent="..."; btn.disabled=true; const {error}=await Data.updateAtleta(id,{nome,sexo,nascimento:di,faixa_etaria:faixa}); if(error){alert("Erro: "+error.message);btn.textContent=org;btn.disabled=false;}else{alert("Atualizado!");this.renderInscritos();} },
  async renderInscritos() { const c=document.getElementById("listaInscritos"); if(!c)return; c.innerHTML="<p style='text-align:center'>Carregando...</p>"; const ats=await Data.getAtletas(); c.innerHTML=""; ats.forEach(a=>{ let nd=a.nascimento; if(a.nascimento&&a.nascimento.includes('-')){const p=a.nascimento.split('-');nd=`${p[2]}/${p[1]}/${p[0]}`;} c.innerHTML+=`<div class="list-item grid-inscritos"><div class="text-left"><input id="nome-${a.id}" value="${a.nome}" disabled></div><div><select id="sexo-${a.id}" disabled><option value="M" ${a.sexo==="M"?"selected":""}>M</option><option value="F" ${a.sexo==="F"?"selected":""}>F</option></select></div><div><input type="tel" id="nasc-${a.id}" value="${nd}" disabled maxlength="10" oninput="UI.mascaraData(this)"></div><div><strong>${a.faixa_etaria}</strong></div><div class="acoes"><button onclick="UI.toggleEdit(${a.id},true)">✏️</button><button id="sv-${a.id}" style="display:none;background:var(--btn-success);color:white" onclick="UI.salvarEdicao(${a.id})">💾</button><button style="background:var(--btn-delete)" onclick="UI.excluirAtleta(${a.id})">🗑️</button></div></div>`; }); },
  async excluirAtleta(id) { if(confirm("Excluir?")) { await Data.deleteAtleta(id); this.renderInscritos(); } },
  async renderConfigWorkouts() { const c=document.getElementById("configList"); if(!c)return; c.innerHTML=`<button onclick="UI.addWorkout()" class="admin-btn-add"><span style="font-size:1.5rem">+</span> CRIAR NOVO WORKOUT</button>`; const cf=await Data.getConfigs(); cf.forEach(x=>{ const i=new Date(x.data_inicio||new Date()); i.setMinutes(i.getMinutes()-i.getTimezoneOffset()); const f=new Date(x.data_limite); f.setMinutes(f.getMinutes()-f.getTimezoneOffset()); c.innerHTML+=`<div class="admin-card"><div class="admin-header"><h3><span style="color:var(--btn-primary)">#${x.ordem}</span> WORKOUT ${x.id}</h3><span class="admin-badge-id">ID: ${x.id}</span></div><div class="admin-row"><div><label class="admin-label">Nome</label><input type="text" id="nome-${x.id}" value="${x.nome||''}" class="admin-input"></div><div><label class="admin-label">Ordem</label><input type="number" id="ordem-${x.id}" value="${x.ordem||x.id}" class="admin-input"></div></div><div style="margin-bottom:20px"><label class="admin-label">Tipo</label><select id="tipo-${x.id}" class="admin-input"><option value="REPS" ${x.tipo==='REPS'?'selected':''}>REPS</option><option value="TIME" ${x.tipo==='TIME'?'selected':''}>TIME</option><option value="CARGA" ${x.tipo==='CARGA'?'selected':''}>CARGA</option></select></div><div class="admin-row"><div><label class="admin-label" style="color:#fbbf24">Abertura</label><input type="datetime-local" id="inicio-${x.id}" value="${i.toISOString().slice(0,16)}" class="admin-input date-start"></div><div><label class="admin-label" style="color:#ef4444">Fechamento</label><input type="datetime-local" id="fim-${x.id}" value="${f.toISOString().slice(0,16)}" class="admin-input date-end"></div></div><div style="display:flex;gap:10px"><button onclick="UI.salvarConfig(${x.id})" class="admin-btn-save">Salvar</button><button onclick="UI.deleteWorkout(${x.id})" class="admin-btn-delete">Excluir</button></div></div>`; }); },
  async addWorkout() { if(!confirm("Criar novo?")) return; const cs=await Data.getConfigs(); const nId=cs.length>0?Math.max(...cs.map(c=>c.id))+1:1; const d=new Date(); const d2=new Date(); d2.setDate(d.getDate()+7); await Data.addConfig({id:nId, nome:`26.${nId}`, ordem:nId, tipo:'REPS', data_inicio:d.toISOString(), data_limite:d2.toISOString()}); this.renderConfigWorkouts(); },
  async deleteWorkout(id) { if(confirm("Excluir?")) { await Data.deleteConfig(id); this.renderConfigWorkouts(); } },
  async salvarConfig(id) { const n=document.getElementById(`nome-${id}`).value, o=document.getElementById(`ordem-${id}`).value, t=document.getElementById(`tipo-${id}`).value, i=document.getElementById(`inicio-${id}`).value, f=document.getElementById(`fim-${id}`).value; await Data.updateConfig(id,{nome:n,ordem:o,tipo:t,data_inicio:new Date(i).toISOString(),data_limite:new Date(f).toISOString()}); location.reload(); },
  fmtPt(pt, pen) { if(!pt) return ""; if(pt >= pen) return ""; return `(${pt})`; },
  getWodInfo(r, id) { const x=r?r.find(z=>z.rodada===id):null; return x?`<small>${x.workout}</small><br><strong>${x.score}</strong>`:"-"; },
  toggleRankDetails(id) { if(window.innerWidth>768)return; const d=document.getElementById(`detalhes-${id}`), l=d.previousElementSibling; if(d.style.display==="none"){d.style.display="grid";l.style.background="rgba(0,174,239,0.1)"}else{d.style.display="none";l.style.background="var(--card-bg)"} },
  mascaraData(i){ let v=i.value.replace(/\D/g,""); if(v.length>2)v=v.replace(/^(\d{2})(\d)/,"$1/$2"); if(v.length>5)v=v.replace(/^(\d{2})\/(\d{2})(\d)/,"$1/$2/$3"); i.value=v; },
  formatarDataParaBanco(d){ if(!d||d.length!==10)return ""; const p=d.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; },
  async initResultados(){ this.atletasCache=await Data.getAtletas(); this.configsCache=await Data.getConfigs(); },
  buscarAtleta(t){ const l=document.getElementById("listaSugestoes"), i=document.getElementById("atletaId"); i.value=""; if(!t){l.style.display="none";return;} const f=this.atletasCache.filter(a=>a.nome.toLowerCase().includes(t.toLowerCase())); l.innerHTML=""; if(f.length){l.style.display="block";f.forEach(a=>{const d=document.createElement("div"); d.className="sugestao-item"; d.innerHTML=`<strong>${a.nome}</strong> <small>(${a.sexo})</small>`; d.onclick=()=>{document.getElementById("buscaAtleta").value=a.nome; i.value=a.id; i.setAttribute("data-nasc-real",a.nascimento); l.style.display="none";}; l.appendChild(d);});}else{l.style.display="none";} },
  selecionarAtleta(id, nome, nascimento) { document.getElementById("buscaAtleta").value = nome; document.getElementById("atletaId").value = id; document.getElementById("atletaId").setAttribute("data-nasc-real", nascimento); document.getElementById("listaSugestoes").style.display = "none"; },
  validarAtleta(){ const i=document.getElementById("atletaId").value, d1=document.getElementById("dataNascimentoLogin").value, d2=document.getElementById("atletaId").getAttribute("data-nasc-real"); if(!i)return alert("Selecione seu nome."); if(this.formatarDataParaBanco(d1)===d2){ document.getElementById("loginCard").style.display="none"; document.getElementById("formResultados").style.display="block"; document.getElementById("nomeAtletaDisplay").textContent=document.getElementById("buscaAtleta").value; this.verificarPrazo(); }else{alert("Data incorreta!");} },
  renderOptionsRodada() { const select = document.getElementById("rodada"); if(!select) return; const currentVal = select.value; select.innerHTML = ""; this.configsCache.forEach(c => { const opt = document.createElement("option"); opt.value = c.id; opt.textContent = c.nome ? `Workout ${c.nome}` : `Workout 26.${c.id}`; select.appendChild(opt); }); if(currentVal) select.value = currentVal; },
  verificarPrazo() { const rodadaId = document.getElementById("rodada").value; const config = this.configsCache.find(c => c.id == rodadaId); const btn=document.getElementById("btnSalvarResultado"), divP=document.getElementById("divPerguntaCap"), inp=document.getElementById("score"); if (!config) return; const now=new Date(), ini=new Date(config.data_inicio), lim=new Date(config.data_limite); if (now<ini) { btn.disabled=true; btn.textContent="AGUARDE"; } else if (now>lim) { btn.disabled=true; btn.textContent="ENCERRADO"; } else { btn.disabled=false; btn.textContent="SALVAR"; } if (config.tipo === 'TIME') { if(divP) divP.style.display="block"; const sim = document.querySelector('input[name="capCheck"][value="SIM"]'); this.toggleInputType(sim && sim.checked); } else { if(divP) divP.style.display="none"; inp.placeholder = config.tipo==='CARGA' ? "Carga (KG)" : "Repetições"; inp.type="number"; } },
  toggleInputType(isTime) { const inp=document.getElementById("score"), lbl=document.getElementById("labelScore"); inp.value=""; if(isTime){ lbl.textContent="Tempo"; inp.placeholder="Ex: 12:30"; inp.type="text"; } else{ lbl.textContent="Reps"; inp.placeholder="Ex: 185"; inp.type="number"; } },
  async lancarResultado(){ const btn=document.getElementById("btnSalvarResultado"), id=document.getElementById("atletaId").value, rod=Number(document.getElementById("rodada").value), cat=document.getElementById("workout").value, sc=document.getElementById("score").value, cf=this.configsCache.find(c=>c.id==rod); if(!id||btn.disabled)return; if(!sc)return alert("Digite resultado"); if(cf.tipo==='TIME'){const s=document.querySelector('input[name="capCheck"][value="SIM"]').checked; if(s&&!sc.includes(':'))return alert("Use dois pontos (Ex: 10:30)"); if(!s&&(sc.includes(':')||isNaN(sc)))return alert("Use apenas números.");} btn.textContent="Salvando..."; btn.disabled=true; const atl=await Data.getAtletaById(id); let res=atl.resultados||[]; res=res.filter(r=>r.rodada!==rod); res.push({rodada:rod, workout:cat, score:sc}); await Data.updateAtleta(id,{resultados:res}); alert("Salvo!"); location.reload(); },
  async cadastrarAtleta(){ const btn=document.querySelector("button"); btn.disabled=true; const n=document.getElementById("nome").value, d=document.getElementById("dataNascimento").value, s=document.getElementById("sexo").value; if(!n||!d||!s){alert("Preencha tudo");btn.disabled=false;return;} if(d.length<10){alert("Data incompleta");btn.disabled=false;return;} const di=this.formatarDataParaBanco(d), ex=await Data.getAtletas(), dup=ex.find(a=>a.nome.toLowerCase()===n.toLowerCase()&&a.nascimento===di); if(dup){alert("Já cadastrado");btn.disabled=false;return;} await Data.addAtleta({id:Date.now(),nome:n,nascimento:di,sexo:s,faixaEtaria:Calc.getFaixa(Calc.getIdade(di)),resultados:[]}); alert("Sucesso!"); window.location.href="inscritos.html"; }
};

window.cadastrarAtleta=()=>UI.cadastrarAtleta(); 
window.lancarResultado=()=>UI.lancarResultado(); 
window.mostrarRanking=()=>UI.renderRanking(); 
window.UI=UI; 
document.addEventListener("DOMContentLoaded",()=>UI.init());