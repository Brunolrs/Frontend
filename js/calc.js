/**
 * ============================================================================
 * calc.js — LÓGICA DE NEGÓCIO (CÁLCULOS)
 * Sem dependências externas — funções puras.
 * ============================================================================
 */

const Calc = {
  /** Retorna a idade a partir de uma data "YYYY-MM-DD" ou "DD/MM/YYYY" */
  getIdade(d) {
    if (!d) return 0;
    let y;
    if (d.includes("-")) {
      y = d.split("-")[0];
    } else {
      const p = d.split("/");
      y = p[2];
    }
    return new Date().getFullYear() - Number(y);
  },

  /** Retorna o rótulo da faixa etária */
  getFaixa(i) {
    if (i < 15)  return "Até 15";
    if (i <= 24) return "16-24";
    if (i <= 29) return "25–29";
    if (i <= 34) return "30–34";
    if (i <= 39) return "35–39";
    if (i <= 45) return "40–44";
    if (i <= 49) return "45–49";
    return "50+";
  },

  /** 3 = RX | 2 = SCALE | 1 = FOUNDATION */
  getTier(w) {
    if (!w) return 1;
    const t = String(w).toUpperCase().trim();
    if (t.includes("RX"))                        return 3;
    if (t.includes("SCALE") || t.includes("SC")) return 2;
    return 1;
  },

  /** Tier geral do atleta considerando todos os resultados */
  getOverallCategoryTier(resultados, totalWods) {
    if (!resultados || resultados.length === 0) return 1;
    if (typeof totalWods === "number" && totalWods > 0 && resultados.length < totalWods) {
      return 1; // atleta não completou todos os WODs → Foundation
    }
    let hasFoundation = false;
    let hasScale = false;
    resultados.forEach((r) => {
      const tier = this.getTier(r.workout);
      if (tier === 1) hasFoundation = true;
      if (tier === 2) hasScale = true;
    });
    if (hasFoundation) return 1;
    if (hasScale)      return 2;
    return 3;
  },

  /** Rótulo textual da categoria geral */
  getCategoriaLabel(res, totalWods) {
    const tier = this.getOverallCategoryTier(res, totalWods);
    if (tier === 3) return "RX";
    if (tier === 2) return "SCALE";
    return "FOUNDATION";
  },

  isTime(v) {
    return String(v).includes(":");
  },

  /** Converte score para número comparável (tempo em segundos ou reps/carga) */
  parseScore(v) {
    if (!v) return 0;
    const s = String(v).trim();
    if (s.includes(":")) {
      const [m, sc] = s.split(":").map(Number);
      return m * 60 + sc;
    }
    return Number(s);
  },

  /**
   * Converte tiebreak (MM:SS) para segundos.
   * Retorna Infinity se ausente — atleta sem tiebreak fica em desvantagem.
   */
  parseTiebreak(v) {
    if (!v) return Infinity;
    const s = String(v).trim();
    if (s.includes(":")) {
      const [m, sc] = s.split(":").map(Number);
      return m * 60 + sc;
    }
    return Infinity;
  },

  /**
   * Ordena um grupo de atletas pelo score de um WOD específico.
   * Hierarquia: Score Principal → Tiebreak (critério secundário oficial CrossFit)
   */
  sortGroup(list, tipoWod, configId) {
    return list.sort((a, b) => {
      const resA = a.resultados.find((r) => r.rodada === configId);
      const resB = b.resultados.find((r) => r.rodada === configId);
      const valA = this.parseScore(resA.score);
      const valB = this.parseScore(resB.score);

      if (tipoWod === "TIME") {
        const isTimeA = this.isTime(resA.score);
        const isTimeB = this.isTime(resB.score);

        // 1º critério: quem terminou vence quem não terminou
        if (isTimeA && !isTimeB) return -1;
        if (!isTimeA && isTimeB) return 1;

        if (isTimeA && isTimeB) {
          // Ambos terminaram → menor tempo vence
          if (valA !== valB) return valA - valB;
          // Empate no tempo → menor tiebreak vence
          return this.parseTiebreak(resA.tiebreak) - this.parseTiebreak(resB.tiebreak);
        }

        // Ambos não terminaram → mais reps vence
        if (valA !== valB) return valB - valA;
        // Empate nas reps → menor tiebreak vence (quem chegou mais rápido no ponto de corte)
        return this.parseTiebreak(resA.tiebreak) - this.parseTiebreak(resB.tiebreak);
      }

      // REPS / CARGA: maior = melhor
      if (valA !== valB) return valB - valA;
      // Empate → menor tiebreak vence
      return this.parseTiebreak(resA.tiebreak) - this.parseTiebreak(resB.tiebreak);
    });
  },
};