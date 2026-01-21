/**
 * ============================================================================
 * 1. CONFIGURAÇÃO E INICIALIZAÇÃO
 * Configura o cliente do Supabase com as credenciais fornecidas.
 * ============================================================================
 */
const SUPABASE_URL = "https://fcnjpdzxqceenfsprrvw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmpwZHp4cWNlZW5mc3BycnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjQxNTAsImV4cCI6MjA4Mzk0MDE1MH0.da-1snEhvQjT3sbQ0vt-DQcmm-D-RzlQzgzkE0VdJpM";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * ============================================================================
 * 2. DATA LAYER (BANCO DE DADOS)
 * Responsável por todas as interações diretas com o Supabase.
 * ============================================================================
 */
const Data = {
    // Busca todos os atletas cadastrados
    async getAtletas() {
        const { data, error } = await supabaseClient.from('atletas').select('*');
        if (error) console.error("Erro ao buscar atletas:", error);
        return data || [];
    },

    // Busca as configurações dos Workouts (WODs), ordenados pela ordem de exibição
    async getConfigs() {
        const { data, error } = await supabaseClient
            .from('workout_config')
            .select('*')
            .order('ordem', { ascending: true });
        if (error) console.error("Erro ao buscar configs:", error);
        return data || [];
    },

    // Atualiza configurações de um Workout específico
    async updateConfig(id, updates) {
        const { error } = await supabaseClient.from('workout_config').update(updates).eq('id', id);
        if (error) {
            alert("Erro: " + error.message);
        } else {
            alert("Salvo!");
        }
    },

    // Adiciona um novo Workout
    async addConfig(config) {
        const { error } = await supabaseClient.from('workout_config').insert([config]);
        return error;
    },

    // Remove um Workout
    async deleteConfig(id) {
        const { error } = await supabaseClient.from('workout_config').delete().eq('id', id);
        return error;
    },

    // Busca um único atleta pelo ID
    async getAtletaById(id) {
        const { data, error } = await supabaseClient.from('atletas').select('*').eq('id', id).single();
        if (error) console.error("Erro ao buscar atleta:", error);
        return data;
    },

    // Atualiza dados ou resultados de um atleta
    async updateAtleta(id, updates) {
        return await supabaseClient.from('atletas').update(updates).eq('id', id);
    },

    // Cria um novo atleta
    async addAtleta(atleta) {
        const { error } = await supabaseClient.from('atletas').insert([atleta]);
        return error;
    },

    // Remove um atleta
    async deleteAtleta(id) {
        await supabaseClient.from('atletas').delete().eq('id', id);
    }
};

/**
 * ============================================================================
 * 3. LÓGICA DE NEGÓCIO (CÁLCULOS)
 * Funções puras para tratamento de dados, datas, categorização e ordenação.
 * ============================================================================
 */
const Calc = {
    // Calcula a idade baseada em strings de data (YYYY-MM-DD ou DD/MM/YYYY)
    getIdade(d) {
        if (!d) return 0;
        let y;
        if (d.includes('-')) {
            y = d.split('-')[0];
        } else {
            const p = d.split('/');
            y = p[2];
        }
        return new Date().getFullYear() - Number(y);
    },

    // Determina a faixa etária com base na idade
    getFaixa(i) {
        if (i < 25) return "Até 24";
        if (i <= 29) return "25–29";
        if (i <= 34) return "30–34";
        if (i <= 39) return "35–39";
        return "40+";
    },

    // Determina o nível (Tier) de um resultado específico: 3=RX, 2=SCALE, 1=FOUNDATION
    getTier(w) {
        if (!w) return 1;
        const t = String(w).toUpperCase().trim();
        if (t.includes("RX")) return 3;
        if (t.includes("SCALE") || t.includes("SC")) return 2;
        return 1;
    },

    // Determina a categoria GERAL do atleta baseada no "menor" nível que ele performou.
    // Lógica: Se fez qualquer WOD Foundation, ele é Foundation no geral.
    // Se não fez Foundation mas fez Scale, é Scale. Caso contrário, RX.
    getOverallCategoryTier(resultados) {
        if (!resultados || resultados.length === 0) return 3;
        let hasFoundation = false;
        let hasScale = false;
        resultados.forEach(r => {
            const tier = this.getTier(r.workout);
            if (tier === 1) hasFoundation = true;
            if (tier === 2) hasScale = true;
        });
        if (hasFoundation) return 1;
        if (hasScale) return 2;
        return 3;
    },

    // Retorna o label string da categoria geral
    getCategoriaLabel(res) {
        const tier = this.getOverallCategoryTier(res);
        if (tier === 3) return "RX";
        if (tier === 2) return "SCALE";
        return "FOUNDATION";
    },

    // Verifica se o score é tempo (contém ':')
    isTime(v) {
        return String(v).includes(':');
    },

    // Converte score MM:SS para segundos (inteiro) ou retorna o número de reps
    parseScore(v) {
        if (!v) return 0;
        const s = String(v).trim();
        if (s.includes(':')) {
            const [m, sc] = s.split(':').map(Number);
            return (m * 60) + sc;
        }
        return Number(s);
    },

    // Ordena um grupo de atletas para um WOD específico
    sortGroup(list, tipoWod, configId) {
        return list.sort((a, b) => {
            const resA = a.resultados.find(r => r.rodada === configId);
            const resB = b.resultados.find(r => r.rodada === configId);
            const valA = this.parseScore(resA.score);
            const valB = this.parseScore(resB.score);

            // Lógica específica para WODs "For Time" (TIME)
            if (tipoWod === 'TIME') {
                const isTimeA = this.isTime(resA.score);
                const isTimeB = this.isTime(resB.score);

                // Se A completou (tempo) e B não (reps/cap), A ganha (-1)
                if (isTimeA && !isTimeB) return -1;
                // Se B completou e A não, B ganha (1)
                if (!isTimeA && isTimeB) return 1;
                // Se ambos completaram (tempo), menor tempo ganha
                if (isTimeA && isTimeB) return valA - valB;
                // Se ambos morreram no CAP (reps), maior número de reps ganha
                return valB - valA;
            }
            // Para AMRAP ou Carga, maior valor ganha
            return valB - valA;
        });
    }
};

/**
 * ============================================================================
 * 4. UI CONTROLLER (INTERFACE)
 * Gerencia a manipulação do DOM, renderização de tabelas e eventos.
 * ============================================================================
 */
const UI = {
    atletasCache: [],
    configsCache: [],

    // Inicialização principal ao carregar a página
    async init() {
        this.configsCache = await Data.getConfigs();

        // Popula o filtro de Workouts na tela de Ranking
        const selWod = document.getElementById("workoutFiltro");
        if (selWod && this.configsCache.length > 0) {
            selWod.innerHTML = '<option value="GERAL">Ranking Geral</option>';
            this.configsCache.forEach(c => {
                const opt = document.createElement("option");
                opt.value = c.id;
                opt.textContent = c.nome || `WOD ${c.id}`;
                selWod.appendChild(opt);
            });
        }

        // Renderizações condicionais baseadas na página atual
        if (document.getElementById("listaInscritos")) await this.renderInscritos();
        if (document.getElementById("buscaAtleta")) await this.initResultados();
        if (document.getElementById("ranking")) await this.renderRanking();

        this.renderOptionsRodada();
        if (document.getElementById("configList")) await this.renderConfigWorkouts();

        // Configura verificação de prazo (abertura/fechamento) de submissão
        const selRodada = document.getElementById("rodada");
        if (selRodada) {
            selRodada.addEventListener("change", () => this.verificarPrazo());
            setTimeout(() => this.verificarPrazo(), 500);
        }
    },

    // --- RENDER RANKING ---

    // Define o grid e cabeçalho da tabela de ranking dinamicamente
    renderRankingHeader(configs, selectedWodId) {
        const h = document.querySelector(".list-header.grid-ranking");
        if (!h) return;

        if (selectedWodId === "GERAL") {
            const gridStyle = `50px 2fr repeat(${configs.length}, minmax(80px, 1fr)) 70px`;
            h.style.setProperty('--grid-cols', gridStyle);
            let html = `<div>Rank</div><div style="text-align:left">Atleta</div>`;
            configs.forEach(c => html += `<div class="wod-col-header" style="color:var(--btn-primary)">${c.nome || c.id}</div>`);
            html += `<div>POINTS</div>`;
            h.innerHTML = html;
        } else {
            const gridStyle = `50px 2fr 1fr 70px`;
            h.style.setProperty('--grid-cols', gridStyle);
            const wodName = configs.find(c => c.id == selectedWodId)?.nome || "Resultado";
            h.innerHTML = `
            <div>Rank</div>
            <div style="text-align:left">Atleta</div>
            <div style="color:var(--btn-primary)">${wodName}</div>
            <div>PTS</div>
        `;
        }
    },

    // Função principal de cálculo e renderização do Ranking
    async renderRanking() {
        const container = document.getElementById("ranking");
        if (!container) return;
        container.innerHTML = "<p style='text-align:center; padding:20px;'>Calculando pontuação...</p>";

        const configs = this.configsCache;
        const fWod = document.getElementById("workoutFiltro")?.value || "GERAL";
        const fSexo = document.getElementById("sexoFiltro").value;
        const fCategoria = document.getElementById("categoriaFiltro").value;
        const fFaixa = document.getElementById("faixaFiltro").value;

        this.renderRankingHeader(configs, fWod);

        let atletas = await Data.getAtletas();

        // 1. Filtra atletas baseados nos selects da UI
        atletas = atletas.filter(a => {
            const faixa = a.faixa_etaria || a.faixaEtaria;
            const catLabel = Calc.getCategoriaLabel(a.resultados || []);
            const matchSexo = (fSexo === "TODOS" || a.sexo === fSexo);
            const matchCat = (fCategoria === "TODAS" || catLabel === fCategoria);
            const matchFaixa = (fFaixa === "GERAL" || faixa === fFaixa);
            return matchSexo && matchCat && matchFaixa;
        });

        // Identifica quais WODs têm resultados
        const activeWods = new Set();
        atletas.forEach(a => a.resultados?.forEach(r => activeWods.add(r.rodada)));

        // 2. Calcula pontuação para cada WOD (CrossFit Games style)
        configs.forEach(conf => {
            if (!activeWods.has(conf.id) && fWod === "GERAL") return;

            // Separa quem fez este WOD
            let participantes = atletas.filter(a => a.resultados && a.resultados.find(r => r.rodada === conf.id));

            // Separa por Categoria dentro do WOD
            let groupRX = participantes.filter(p => Calc.getTier(p.resultados.find(r => r.rodada === conf.id).workout) === 3);
            let groupScale = participantes.filter(p => Calc.getTier(p.resultados.find(r => r.rodada === conf.id).workout) === 2);
            let groupFoundation = participantes.filter(p => Calc.getTier(p.resultados.find(r => r.rodada === conf.id).workout) === 1);

            // Ordena cada grupo independentemente
            groupRX = Calc.sortGroup(groupRX, conf.tipo, conf.id);
            groupScale = Calc.sortGroup(groupScale, conf.tipo, conf.id);
            groupFoundation = Calc.sortGroup(groupFoundation, conf.tipo, conf.id);

            // Atribui pontos sequenciais. 
            // Scale começa somando os pontos do RX, Foundation soma RX + Scale.
            let currentRank = 1;
            let sumRX = this.assignPointsToGroup(groupRX, conf.id, currentRank, 0);
            let sumSC = this.assignPointsToGroup(groupScale, conf.id, currentRank, sumRX);
            this.assignPointsToGroup(groupFoundation, conf.id, currentRank, sumRX + sumSC);

            // Penalidade máxima para quem não fez (Quantidade de inscritos + 5)
            const maxPen = participantes.length + 5;
            atletas.forEach(a => {
                if (!a.pontosWod) a.pontosWod = {};
                // Se não tiver pontuação neste WOD, aplica penalidade
                if (!a.pontosWod[conf.id]) a.pontosWod[conf.id] = maxPen;
            });
        });

        // 3. Ordenação Final da Tabela
        if (fWod === "GERAL") {
            atletas.sort((a, b) => {
                let ptsA = 0,
                    ptsB = 0;
                configs.forEach(c => {
                    ptsA += (a.pontosWod?.[c.id] || 0);
                    ptsB += (b.pontosWod?.[c.id] || 0);
                });
                
                // Critério 1: Soma total de pontos (menor é melhor)
                if (ptsA !== ptsB) return ptsA - ptsB;

                // Critério de desempate: Comparação posição a posição em cada WOD
                const rA = configs.map(c => a.pontosWod?.[c.id] || 999).sort((x, y) => x - y);
                const rB = configs.map(c => b.pontosWod?.[c.id] || 999).sort((x, y) => x - y);
                for (let i = 0; i < rA.length; i++) {
                    if (rA[i] !== rB[i]) return rA[i] - rB[i];
                }
                return 0;
            });
        } else {
            // Ordenação para WOD único
            const wodId = Number(fWod);
            atletas.sort((a, b) => {
                const ptA = a.pontosWod?.[wodId] || 9999;
                const ptB = b.pontosWod?.[wodId] || 9999;
                return ptA - ptB;
            });
        }

        // Renderização HTML
        container.innerHTML = "";
        if (fWod !== "GERAL") {
            const wodId = Number(fWod);
            atletas = atletas.filter(a => a.resultados && a.resultados.some(r => r.rodada === wodId));
        }

        if (atletas.length === 0) {
            container.innerHTML = "<p style='text-align:center; padding:20px; color:#aaa;'>Nenhum resultado encontrado.</p>";
            return;
        }

        const penalidadeRef = atletas.length + 5;

        atletas.forEach((a, idx) => {
            const medalha = (idx + 1) === 1 ? "🥇" : (idx + 1) === 2 ? "🥈" : (idx + 1) === 3 ? "🥉" : `${idx + 1}º`;
            const res = a.resultados || [];
            let innerRowHTML = "";
            let detailsHTML = "";

            if (fWod === "GERAL") {
                let total = 0;
                configs.forEach(c => {
                    if (activeWods.has(c.id)) total += (a.pontosWod?.[c.id] || 0);
                });

                let colsHTML = "";
                configs.forEach(c => {
                    const info = this.getWodInfo(res, c.id);
                    const pt = this.fmtPt(a.pontosWod?.[c.id], penalidadeRef);
                    colsHTML += `<div class="wod-col">${info} <span class="pts-wod">${pt}</span></div>`;
                    detailsHTML += `<div class="detalhe-box"><span>${c.nome}</span> ${info}</div>`;
                });

                innerRowHTML = `
          ${colsHTML}
          <div class="score-highlight">${total} <small>pts</small></div>
          <div class="mobile-result-wrapper" style="display:none;">
             <span class="mobile-wod-cat">TOTAL</span>
             <span class="mobile-result-value">${total}</span>
             <span class="mobile-result-points">PTS</span>
          </div>
        `;
            } else {
                const wodId = Number(fWod);
                const resObj = res.find(r => r.rodada === wodId);
                const displayScore = resObj ? resObj.score : "-";
                const displayCat = resObj ? resObj.workout : "";
                const pt = a.pontosWod?.[wodId] || "-";
                const info = this.getWodInfo(res, wodId);

                innerRowHTML = `
          <div class="score-highlight" style="font-size:1.2em;">${pt} <small>pts</small></div>
          <div style="font-size:1.1em;" class="wod-col">${info}</div>
          <div class="mobile-result-wrapper" style="display:none;">
             <span class="mobile-wod-cat">${displayCat}</span>
             <span class="mobile-result-value">${displayScore}</span>
             <span class="mobile-result-points">${pt} pts</span>
          </div>
        `;
            }

            const tierGeral = Calc.getOverallCategoryTier(res);
            let catBadge = tierGeral === 3 ? `<span style="color:#22c55e; border:1px solid #22c55e; font-size:0.7em; padding:0 3px; border-radius:3px; margin-left:6px;">RX</span>` :
                tierGeral === 2 ? `<span style="color:#fbbf24; border:1px solid #fbbf24; font-size:0.7em; padding:0 3px; border-radius:3px; margin-left:6px;">SC</span>` :
                `<span style="color:#94a3b8; border:1px solid #94a3b8; font-size:0.7em; padding:0 3px; border-radius:3px; margin-left:6px;">FD</span>`;

            const currentGridStyle = document.querySelector(".list-header.grid-ranking").style.getPropertyValue('--grid-cols');

            container.innerHTML += `
        <div class="list-item grid-ranking" style="--grid-cols: ${currentGridStyle}" onclick="UI.toggleRankDetails(${a.id})">
          <div class="posicao">${medalha}</div>
          <div class="text-left nome-col">
            <div class="nome-row"><strong>${a.nome}</strong>${catBadge}</div>
            <div class="info-row">${a.sexo} • ${a.faixa_etaria}</div>
          </div>
          ${innerRowHTML}
        </div>
        <div id="detalhes-${a.id}" class="ranking-details" style="display:none;">
            ${detailsHTML}
        </div>`;
        });
    },

    // Atribui pontos e lida com empates (Tie-break)
    assignPointsToGroup(sortedList, configId, startRank, penaltyToAdd) {
        let sumPoints = 0;
        for (let i = 0; i < sortedList.length; i++) {
            const p = sortedList[i];
            if (!p.pontosWod) p.pontosWod = {};
            
            // Lógica de empate: Se o score for idêntico ao anterior, recebe a mesma pontuação
            if (i > 0) {
                const prevP = sortedList[i - 1];
                const resCur = p.resultados.find(r => r.rodada === configId);
                const resPrev = prevP.resultados.find(r => r.rodada === configId);
                
                if (Calc.isTime(resCur.score) === Calc.isTime(resPrev.score) &&
                    Calc.parseScore(resCur.score) === Calc.parseScore(resPrev.score)) {
                    p.pontosWod[configId] = prevP.pontosWod[configId];
                    sumPoints += p.pontosWod[configId];
                    continue;
                }
            }
            
            let finalScore = (startRank + i) + penaltyToAdd;
            p.pontosWod[configId] = finalScore;
            sumPoints += finalScore;
        }
        return sumPoints;
    },

    // Expande detalhes do atleta (Mobile)
    toggleRankDetails(id) {
        if (window.innerWidth > 768) return;
        const d = document.getElementById(`detalhes-${id}`);
        if (!d) return;

        const currentDisplay = window.getComputedStyle(d).display;
        const l = d.previousElementSibling;

        if (currentDisplay === "none") {
            d.style.display = "grid";
            l.style.background = "rgba(0,174,239,0.1)";
        } else {
            d.style.display = "none";
            l.style.background = "var(--card-bg)";
        }
    },

    // --- UTILS ---
    
    // Habilita/Desabilita campos de edição na lista de inscritos
    toggleEdit(id, modo) {
        const campos = ["nome", "sexo", "nasc"];
        campos.forEach(c => {
            const el = document.getElementById(`${c}-${id}`);
            if (el) {
                el.disabled = !modo;
                if (modo) {
                    el.classList.add("input-editavel");
                    if (c === "nome") el.focus();
                } else {
                    el.classList.remove("input-editavel");
                }
            }
        });
        const btn = document.getElementById(`sv-${id}`);
        if (btn) btn.style.display = modo ? "inline-block" : "none";
    },

    // Salva alterações de um atleta (Admin)
    async salvarEdicao(id) {
        const nome = document.getElementById(`nome-${id}`).value;
        const sexo = document.getElementById(`sexo-${id}`).value;
        const nasc = document.getElementById(`nasc-${id}`).value;
        
        if (!nome || !nasc) return alert("Preencha todos os campos");
        
        const di = this.formatarDataParaBanco(nasc);
        const faixa = Calc.getFaixa(Calc.getIdade(di));
        const btn = document.getElementById(`sv-${id}`);
        const org = btn.textContent;
        
        btn.textContent = "...";
        btn.disabled = true;
        
        const { error } = await Data.updateAtleta(id, {
            nome,
            sexo,
            nascimento: di,
            faixa_etaria: faixa
        });
        
        if (error) {
            alert("Erro: " + error.message);
            btn.textContent = org;
            btn.disabled = false;
        } else {
            alert("Atualizado!");
            this.renderInscritos();
        }
    },

    // Renderiza a lista de inscritos para Admin
    async renderInscritos() {
        const c = document.getElementById("listaInscritos");
        if (!c) return;
        c.innerHTML = "<p style='text-align:center'>Carregando...</p>";
        const ats = await Data.getAtletas();
        c.innerHTML = "";
        
        ats.forEach(a => {
            let nd = a.nascimento;
            if (a.nascimento && a.nascimento.includes('-')) {
                const p = a.nascimento.split('-');
                nd = `${p[2]}/${p[1]}/${p[0]}`;
            }
            c.innerHTML += `<div class="list-item grid-inscritos"><div class="text-left"><input id="nome-${a.id}" value="${a.nome}" disabled></div><div><select id="sexo-${a.id}" disabled><option value="M" ${a.sexo === "M" ? "selected" : ""}>M</option><option value="F" ${a.sexo === "F" ? "selected" : ""}>F</option></select></div><div><input type="tel" id="nasc-${a.id}" value="${nd}" disabled maxlength="10" oninput="UI.mascaraData(this)"></div><div><strong>${a.faixa_etaria}</strong></div><div class="acoes"><button onclick="UI.toggleEdit(${a.id},true)">✏️</button><button id="sv-${a.id}" style="display:none;background:var(--btn-success);color:white" onclick="UI.salvarEdicao(${a.id})">💾</button><button style="background:var(--btn-delete)" onclick="UI.excluirAtleta(${a.id})">🗑️</button></div></div>`;
        });
    },

    async excluirAtleta(id) {
        if (confirm("Excluir?")) {
            await Data.deleteAtleta(id);
            this.renderInscritos();
        }
    },

    // --- ADMIN RENDER (CONFIGURAR WORKOUTS) ---
    async renderConfigWorkouts() {
        const c = document.getElementById("configList");
        if (!c) return;
        c.innerHTML = `<button onclick="UI.addWorkout()" class="admin-btn-add"><span>+</span> CRIAR WORKOUT</button>`;
        const cf = await Data.getConfigs();

        cf.forEach(x => {
            // Ajuste de fuso horário para inputs datetime-local
            const i = new Date(x.data_inicio || new Date());
            i.setMinutes(i.getMinutes() - i.getTimezoneOffset());
            const f = new Date(x.data_limite);
            f.setMinutes(f.getMinutes() - f.getTimezoneOffset());

            // AQUI MUDAMOS O TEXTO VISUAL, MAS O VALUE CONTINUA TÉCNICO
            c.innerHTML += `
        <div class="admin-card">
            <div class="admin-header">
                <h3>#${x.ordem} WORKOUT ${x.id}</h3>
                <span class="admin-badge-id">ID: ${x.id}</span>
            </div>
            <div class="admin-row">
                <div><label class="admin-label">Nome</label><input type="text" id="nome-${x.id}" value="${x.nome || ''}" class="admin-input"></div>
                <div><label class="admin-label">Ordem</label><input type="number" id="ordem-${x.id}" value="${x.ordem || x.id}" class="admin-input"></div>
            </div>
            <div style="margin-bottom:20px">
                <label class="admin-label">Tipo</label>
                <select id="tipo-${x.id}" class="admin-input">
                    <option value="REPS" ${x.tipo === 'REPS' ? 'selected' : ''}>AMRAP</option> 
                    <option value="TIME" ${x.tipo === 'TIME' ? 'selected' : ''}>For Time Cap</option>
                    <option value="CARGA" ${x.tipo === 'CARGA' ? 'selected' : ''}>Carga Max</option>
                </select>
            </div>
            <div class="admin-row">
                <div><label class="admin-label" style="color:#fbbf24">Abertura</label><input type="datetime-local" id="inicio-${x.id}" value="${i.toISOString().slice(0, 16)}" class="admin-input date-start"></div>
                <div><label class="admin-label" style="color:#ef4444">Fechamento</label><input type="datetime-local" id="fim-${x.id}" value="${f.toISOString().slice(0, 16)}" class="admin-input date-end"></div>
            </div>
            <div style="display:flex;gap:10px">
                <button onclick="UI.salvarConfig(${x.id})" class="admin-btn-save">Salvar</button>
                <button onclick="UI.deleteWorkout(${x.id})" class="admin-btn-delete">Excluir</button>
            </div>
        </div>`;
        });
    },

    async addWorkout() {
        if (!confirm("Criar novo?")) return;
        const cs = await Data.getConfigs();
        const nId = cs.length > 0 ? Math.max(...cs.map(c => c.id)) + 1 : 1;
        const d = new Date();
        const d2 = new Date();
        d2.setDate(d.getDate() + 7);
        await Data.addConfig({
            id: nId,
            nome: `26.${nId}`,
            ordem: nId,
            tipo: 'REPS',
            data_inicio: d.toISOString(),
            data_limite: d2.toISOString()
        });
        this.renderConfigWorkouts();
    },

    async deleteWorkout(id) {
        if (confirm("Excluir?")) {
            await Data.deleteConfig(id);
            this.renderConfigWorkouts();
        }
    },

    async salvarConfig(id) {
        const n = document.getElementById(`nome-${id}`).value,
            o = document.getElementById(`ordem-${id}`).value,
            t = document.getElementById(`tipo-${id}`).value,
            i = document.getElementById(`inicio-${id}`).value,
            f = document.getElementById(`fim-${id}`).value;
            
        await Data.updateConfig(id, {
            nome: n,
            ordem: o,
            tipo: t,
            data_inicio: new Date(i).toISOString(),
            data_limite: new Date(f).toISOString()
        });
        location.reload();
    },

    // Formata exibição dos pontos (esconde se for penalidade)
    fmtPt(pt, pen) {
        if (!pt) return "";
        if (pt >= pen) return "";
        return `(${pt})`;
    },

    getWodInfo(r, id) {
        const x = r ? r.find(z => z.rodada === id) : null;
        return x ? `<small>${x.workout}</small><br><strong>${x.score}</strong>` : "-";
    },

    // Máscara de input de data DD/MM/YYYY
    mascaraData(i) {
        let v = i.value.replace(/\D/g, "");
        if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, "$1/$2");
        if (v.length > 5) v = v.replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
        i.value = v;
    },

    formatarDataParaBanco(d) {
        if (!d || d.length !== 10) return "";
        const p = d.split('/');
        return `${p[2]}-${p[1]}-${p[0]}`;
    },

    async initResultados() {
        this.atletasCache = await Data.getAtletas();
        this.configsCache = await Data.getConfigs();
    },

    // Autocomplete/Sugestão de nome do atleta
    buscarAtleta(t) {
        const l = document.getElementById("listaSugestoes"),
            i = document.getElementById("atletaId");
        i.value = "";
        if (!t) {
            l.style.display = "none";
            return;
        }
        const f = this.atletasCache.filter(a => a.nome.toLowerCase().includes(t.toLowerCase()));
        l.innerHTML = "";
        if (f.length) {
            l.style.display = "block";
            f.forEach(a => {
                const d = document.createElement("div");
                d.className = "sugestao-item";
                d.innerHTML = `<strong>${a.nome}</strong> <small>(${a.sexo})</small>`;
                d.onclick = () => {
                    document.getElementById("buscaAtleta").value = a.nome;
                    i.value = a.id;
                    i.setAttribute("data-nasc-real", a.nascimento);
                    l.style.display = "none";
                };
                l.appendChild(d);
            });
        } else {
            l.style.display = "none";
        }
    },

    selecionarAtleta(id, nome, nascimento) {
        document.getElementById("buscaAtleta").value = nome;
        document.getElementById("atletaId").value = id;
        document.getElementById("atletaId").setAttribute("data-nasc-real", nascimento);
        document.getElementById("listaSugestoes").style.display = "none";
    },

    // Valida o login do atleta pela data de nascimento
    validarAtleta() {
        const i = document.getElementById("atletaId").value,
            d1 = document.getElementById("dataNascimentoLogin").value,
            d2 = document.getElementById("atletaId").getAttribute("data-nasc-real");
        if (!i) return alert("Selecione seu nome.");
        if (this.formatarDataParaBanco(d1) === d2) {
            document.getElementById("loginCard").style.display = "none";
            document.getElementById("formResultados").style.display = "block";
            document.getElementById("nomeAtletaDisplay").textContent = document.getElementById("buscaAtleta").value;
            this.verificarPrazo();
        } else {
            alert("Data incorreta!");
        }
    },

    renderOptionsRodada() {
        const select = document.getElementById("rodada");
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = "";
        this.configsCache.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = c.nome ? `Workout ${c.nome}` : `Workout 26.${c.id}`;
            select.appendChild(opt);
        });
        if (currentVal) select.value = currentVal;
    },

    // Verifica se o prazo para lançar resultados está aberto
    verificarPrazo() {
        const rodadaId = document.getElementById("rodada").value;
        const config = this.configsCache.find(c => c.id == rodadaId);
        const btn = document.getElementById("btnSalvarResultado"),
            av = document.getElementById("avisoPrazo"),
            divP = document.getElementById("divPerguntaCap"),
            inp = document.getElementById("score");
        if (!config) return;

        const now = new Date(),
            ini = new Date(config.data_inicio),
            lim = new Date(config.data_limite);
        const opt = {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        };

        if (now < ini) {
            btn.disabled = true;
            inp.disabled = true;
            btn.textContent = "AGUARDE O INÍCIO";
            btn.style.backgroundColor = "#fbbf24";
            btn.style.color = "#000";
            if (av) {
                av.textContent = `Abre em: ${ini.toLocaleDateString('pt-BR', opt)}`;
                av.style.color = "#fbbf24";
            }
        } else if (now > lim) {
            btn.disabled = true;
            inp.disabled = true;
            btn.textContent = "PRAZO ENCERRADO";
            btn.style.backgroundColor = "#475569";
            btn.style.color = "#fff";
            if (av) {
                av.textContent = `Fechou em: ${lim.toLocaleDateString('pt-BR', opt)}`;
                av.style.color = "#ef4444";
            }
        } else {
            btn.disabled = false;
            inp.disabled = false;
            btn.textContent = "SALVAR RESULTADO";
            btn.style.backgroundColor = "var(--btn-primary)";
            btn.style.color = "#fff";
            if (av) {
                av.textContent = `Aberto até: ${lim.toLocaleDateString('pt-BR', opt)}`;
                av.style.color = "var(--btn-primary)";
            }
        }

        // Ajuste de UI dependendo se é Time Cap ou Reps/Carga
        if (config.tipo === 'TIME') {
            if (divP) divP.style.display = "block";
            const sim = document.querySelector('input[name="capCheck"][value="SIM"]');
            this.toggleInputType(sim && sim.checked);
        } else {
            if (divP) divP.style.display = "none";
            inp.placeholder = config.tipo === 'CARGA' ? "Carga (lb)" : "Repetições";
            inp.type = "number";
        }
    },

    toggleInputType(isTime) {
        const inp = document.getElementById("score"),
            lbl = document.getElementById("labelScore");
        inp.value = "";
        if (isTime) {
            lbl.textContent = "Tempo";
            inp.placeholder = "Ex: 12:30";
            inp.type = "text";
        } else {
            lbl.textContent = "Reps";
            inp.placeholder = "Ex: 185";
            inp.type = "number";
        }
    },

    // Envia o resultado para o banco
    async lancarResultado() {
        const btn = document.getElementById("btnSalvarResultado"),
            id = document.getElementById("atletaId").value,
            rod = Number(document.getElementById("rodada").value),
            cat = document.getElementById("workout").value,
            scoreVal = document.getElementById("score").value,
            cf = this.configsCache.find(c => c.id == rod);

        if (!id || btn.disabled) return;
        if (!scoreVal) return alert("Digite resultado");

        // Validação de formato para TIME vs REPS
        if (cf.tipo === 'TIME') {
            const s = document.querySelector('input[name="capCheck"][value="SIM"]').checked;
            if (s && !scoreVal.includes(':')) return alert("Use dois pontos (Ex: 10:30)");
            if (!s && (scoreVal.includes(':') || isNaN(scoreVal))) return alert("Use apenas números.");
        }

        btn.textContent = "Salvando...";
        btn.disabled = true;

        const atl = await Data.getAtletaById(id);
        let res = atl.resultados || [];
        // Remove resultado anterior deste mesmo workout, se existir
        res = res.filter(r => r.rodada !== rod);
        res.push({
            rodada: rod,
            workout: cat,
            score: scoreVal
        });

        const { error } = await Data.updateAtleta(id, { resultados: res });
        if (error) {
            alert("Erro ao salvar: " + error.message);
            btn.textContent = "TENTAR NOVAMENTE";
            btn.disabled = false;
        } else {
            alert("Resultado Salvo!");
            location.reload();
        }
    },

    // Cadastro de novo atleta pelo usuário
    async cadastrarAtleta() {
        const btn = document.querySelector("button");
        btn.disabled = true;
        const n = document.getElementById("nome").value,
            d = document.getElementById("dataNascimento").value,
            s = document.getElementById("sexo").value;

        if (!n || !d || !s) {
            alert("Preencha tudo");
            btn.disabled = false;
            return;
        }
        if (d.length < 10) {
            alert("Data incompleta");
            btn.disabled = false;
            return;
        }

        const di = this.formatarDataParaBanco(d),
            ex = await Data.getAtletas(),
            dup = ex.find(a => a.nome.toLowerCase() === n.toLowerCase() && a.nascimento === di);

        if (dup) {
            alert("Já cadastrado");
            btn.disabled = false;
            return;
        }

        await Data.addAtleta({
            nome: n,
            nascimento: di,
            sexo: s,
            faixa_etaria: Calc.getFaixa(Calc.getIdade(di)),
            resultados: []
        });
        alert("Sucesso!");
        window.location.href = "inscritos.html";
    }
};

// Exports globais para uso no HTML inline (onclick, etc)
window.cadastrarAtleta = () => UI.cadastrarAtleta();
window.lancarResultado = () => UI.lancarResultado();
window.mostrarRanking = () => UI.renderRanking();
window.UI = UI;

document.addEventListener("DOMContentLoaded", () => UI.init());