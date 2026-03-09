/**
 * ============================================================================
 * config.js — CONFIGURAÇÃO E INICIALIZAÇÃO DO SUPABASE
 * ============================================================================
 */

// ── Produção ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://fcnjpdzxqceenfsprrvw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmpwZHp4cWNlZW5mc3BycnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjQxNTAsImV4cCI6MjA4Mzk0MDE1MH0.da-1snEhvQjT3sbQ0vt-DQcmm-D-RzlQzgzkE0VdJpM";

// ── Teste ─────────────────────────────────────────────────────────────────────
//const SUPABASE_URL = "https://rhjdelkpdmnzotdjddji.supabase.co";
//const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoamRlbGtwZG1uem90ZGpkZGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDg0MzksImV4cCI6MjA4NTEyNDQzOX0.QSK316Id2FW_X2FDtIOdlima8v37dgQ3n9NuxVjFxwY";

// Exporta o cliente globalmente (usado por data.js e ui.js)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
