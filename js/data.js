/**
 * ============================================================================
 * data.js — DATA LAYER (BANCO DE DADOS)
 * Depende de: config.js (supabaseClient)
 * ============================================================================
 */

const Data = {
  async getAtletas() {
    const { data, error } = await supabaseClient.from("atletas").select("*");
    if (error) console.error("Erro ao buscar atletas:", error);
    return data || [];
  },

  async getAtletaById(id) {
    const { data, error } = await supabaseClient
      .from("atletas")
      .select("*")
      .eq("id", id)
      .single();
    if (error) console.error("Erro ao buscar atleta:", error);
    return data;
  },

  async addAtleta(atleta) {
    const { error } = await supabaseClient.from("atletas").insert([atleta]);
    return error;
  },

  async updateAtleta(id, updates) {
    return await supabaseClient.from("atletas").update(updates).eq("id", id);
  },

  async deleteAtleta(id) {
    await supabaseClient.from("atletas").delete().eq("id", id);
  },

  async getConfigs() {
    const { data, error } = await supabaseClient
      .from("workout_config")
      .select("*")
      .order("ordem", { ascending: true });
    if (error) console.error("Erro ao buscar configs:", error);
    return data || [];
  },

  async addConfig(config) {
    const { error } = await supabaseClient.from("workout_config").insert([config]);
    return error;
  },

  async updateConfig(id, updates) {
    const { error } = await supabaseClient
      .from("workout_config")
      .update(updates)
      .eq("id", id);
    if (error) alert("Erro: " + error.message);
    else alert("Salvo!");
  },

  async deleteConfig(id) {
    const { error } = await supabaseClient
      .from("workout_config")
      .delete()
      .eq("id", id);
    return error;
  },
};
