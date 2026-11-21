/**
 * Spake Legend Arena — AdminAuthManager
 *
 * Gerenciador dedicado de autenticação invisível de Administrador:
 * 1. Método 1 (Web/WebGL): Lê o parâmetro secreto `?adminKey=CHAVE_SECRETA` de `window.location.search`
 *    durante o carregamento da aplicação, valida com o backend/chave secreta e define `isAdmin = true`
 *    silenciosamente para liberar o Painel de Upload de Áudios.
 * 2. Método 2 (Fallback de 7 Toques em < 3s): Contabiliza 7 toques consecutivos em menos de 3 segundos
 *    sobre o Texto da Versão do Jogo e valida a senha secreta digitada no painel minimalista.
 */

import { useEffect, useState } from 'react';
import {
  customSoundtrackManager,
  DEFAULT_ADMIN_7TAP_PASSWORD,
  DEFAULT_ADMIN_URL_KEY,
  extractAdminKeyFromUrlSearch,
  SECRET_TAP_REQUIRED_COUNT,
  SECRET_TAP_WINDOW_MS,
} from '../audio/customSoundtrackManager';

export {
  DEFAULT_ADMIN_URL_KEY,
  DEFAULT_ADMIN_7TAP_PASSWORD,
  SECRET_TAP_REQUIRED_COUNT,
  SECRET_TAP_WINDOW_MS,
  extractAdminKeyFromUrlSearch,
};

export type AdminAuthListener = (isAdmin: boolean) => void;

export class AdminAuthManager {
  private isAdminState = false;
  private listeners = new Set<AdminAuthListener>();
  private tapTimestamps: number[] = [];

  constructor() {
    this.isAdminState = customSoundtrackManager.isAdminUser();
    customSoundtrackManager.subscribe(() => {
      const synced = customSoundtrackManager.isAdminUser();
      if (this.isAdminState !== synced) {
        this.isAdminState = synced;
        this.notify();
      }
    });
  }

  /**
   * Retorna o estado interno atual de `isAdmin`.
   */
  public isAdmin(): boolean {
    return this.isAdminState;
  }

  /**
   * Define manualmente o estado `isAdmin` (usado após validação ou logout).
   */
  public setAdmin(nextIsAdmin: boolean): void {
    if (!nextIsAdmin) {
      customSoundtrackManager.logoutAdmin();
    }
    if (this.isAdminState !== nextIsAdmin) {
      this.isAdminState = nextIsAdmin;
      this.notify();
    }
  }

  /**
   * Método 1: Lê `adminKey` de `window.location.search` (ex: `?adminKey=spike-admin-2025`),
   * valida a chave secreta e atualiza o estado interno `isAdmin = true` silenciosamente.
   */
  public async initializeFromUrl(searchOverride?: string): Promise<boolean> {
    const search =
      typeof searchOverride === 'string'
        ? searchOverride
        : typeof window !== 'undefined'
          ? window.location.search
          : '';

    const adminKey = extractAdminKeyFromUrlSearch(search);
    if (!adminKey) {
      return this.isAdminState;
    }

    const unlocked = await customSoundtrackManager.checkUrlAdminKey(search);
    this.isAdminState = unlocked || customSoundtrackManager.isAdminUser();
    this.notify();
    return this.isAdminState;
  }

  /**
   * Método 2 (Passo 1): Registra um toque no botão invisível sobre o Texto da Versão do Jogo.
   * Retorna `true` se o usuário atingir 7 toques consecutivos em menos de 3 segundos (3000ms).
   */
  public registerVersionTap(nowMs = Date.now()): boolean {
    this.tapTimestamps = this.tapTimestamps.filter(
      (t) => nowMs - t <= SECRET_TAP_WINDOW_MS,
    );
    this.tapTimestamps.push(nowMs);
    if (this.tapTimestamps.length >= SECRET_TAP_REQUIRED_COUNT) {
      this.tapTimestamps = [];
      return true;
    }
    return false;
  }

  /**
   * Método 2 (Passo 2): Valida a senha digitada no painel minimalista de 7 toques.
   */
  public async authenticateWithSecretPassword(password: string): Promise<boolean> {
    const result = await customSoundtrackManager.authenticateAdminWithPassword(password);
    this.isAdminState = result.ok && customSoundtrackManager.isAdminUser();
    this.notify();
    return result.ok;
  }

  /**
   * Encerra a sessão de Administrador e oculta novamente o Painel de Upload.
   */
  public logout(): void {
    this.tapTimestamps = [];
    customSoundtrackManager.logoutAdmin();
    this.isAdminState = false;
    this.notify();
  }

  /**
   * Inscreve um listener para reagir a mudanças em `isAdmin`.
   */
  public subscribe(listener: AdminAuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.isAdminState);
    }
  }
}

export const adminAuthManager = new AdminAuthManager();

/**
 * Hook React para consumir o estado `isAdmin` e inicializar a leitura de `window.location.search`
 * diretamente no componente raiz (`App`).
 */
export function useAdminAuth(): {
  isAdmin: boolean;
  setIsAdmin: (next: boolean) => void;
  logoutAdmin: () => void;
} {
  const [isAdmin, setIsAdminState] = useState<boolean>(() => adminAuthManager.isAdmin());

  useEffect(() => {
    const unsub = adminAuthManager.subscribe((next) => {
      setIsAdminState(next);
    });
    void adminAuthManager.initializeFromUrl();
    return unsub;
  }, []);

  return {
    isAdmin,
    setIsAdmin: (next: boolean) => adminAuthManager.setAdmin(next),
    logoutAdmin: () => adminAuthManager.logout(),
  };
}
