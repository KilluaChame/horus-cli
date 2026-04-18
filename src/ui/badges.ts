/**
 * badges.ts — Badges de Saúde de Projeto para o Horus CLI (Fase 8)
 *
 * Responsável por computar os indicadores visuais do estado de um projeto:
 *   📦 Tem package.json
 *   👁️  Tem horus.json (configuração premium)
 *   ⚠️  Caminho inexistente no disco
 *
 * ⚡ Performance: usa fs.existsSync — síncrono e rápido para checagens
 *    de presença local. NÃO é chamado no boot; apenas quando a lista
 *    de projetos é exibida (lazy).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { theme } from './theme.js';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ProjectHealth {
  /** O diretório do projeto existe no disco */
  exists: boolean;
  /** Tem manifest .horus/horus.json (ou o antigo na raiz) */
  hasHorusJson: boolean;
  /** Tem package.json na raiz */
  hasPackageJson: boolean;
}

// ─── Computação de saúde ─────────────────────────────────────────────────────

/**
 * Verifica o estado de saúde de um projeto pelo caminho.
 * Todas as checagens são feitas com existsSync — rápido e síncrono.
 *
 * @param projectPath Caminho absoluto do projeto
 */
export function getProjectHealth(projectPath: string): ProjectHealth {
  const exists = fs.existsSync(projectPath);

  if (!exists) {
    return { exists: false, hasHorusJson: false, hasPackageJson: false };
  }

  return {
    exists: true,
    hasHorusJson:    fs.existsSync(path.join(projectPath, '.horus', 'horus.json')) || fs.existsSync(path.join(projectPath, 'horus.json')),
    hasPackageJson:  fs.existsSync(path.join(projectPath, 'package.json')),
  };
}

// ─── Renderização ────────────────────────────────────────────────────────────

/**
 * Converte o estado de saúde em uma string de badges coloridos.
 *
 * Exemplos de output:
 *   👁️  📦        (horus.json + package.json — projeto premium)
 *   📦             (só package.json — projeto Node simples)
 *   ⚠️  inválido   (diretório não encontrado)
 */
export function renderHealthBadges(health: ProjectHealth): string {
  if (!health.exists) {
    return theme.warn('⚠️  inválido');
  }

  const badges: string[] = [];

  if (health.hasHorusJson) {
    badges.push(theme.success('👁️ '));
  }

  if (health.hasPackageJson) {
    badges.push(theme.muted('📦'));
  }

  if (badges.length === 0) {
    badges.push(theme.muted('—'));
  }

  return badges.join(' ');
}

/**
 * Formata o label de um projeto para uso em select com busca.
 * Combina nome + badges numa string única.
 *
 * @param name Nome do projeto
 * @param health objeto de saúde calculado
 */
export function formatProjectLabel(name: string, health: ProjectHealth): string {
  const badges = renderHealthBadges(health);
  return `${theme.accent(name)}  ${badges}`;
}
