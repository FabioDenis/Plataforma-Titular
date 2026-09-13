import {
  generateMetaAuthUrl,
  verifyOAuthState,
  handleMetaCallback,
  confirmPageSelection,
  getOrganizationSocialStatus,
  disconnectSocialAccounts,
  AdministeredPageItem,
  PublicConnectionStatus,
} from './oauth';
import { getMetaConfig, isMetaConfigured } from './config';
import { publishToFacebookPage } from './facebook';
import { publishToInstagram } from './instagram';

/**
 * MetaService: Unified high-level service for Meta Graph API integration
 * Stage 1: Official connection and multi-institution account selection.
 * Stage 2: (Separated) Publishing content.
 */
export const MetaService = {
  /**
   * Generates the official Meta OAuth authorization URL
   */
  authenticate(orgId: string, userId: string, customRedirectUri?: string): string {
    return generateMetaAuthUrl(orgId, userId, customRedirectUri);
  },

  /**
   * Processes the OAuth callback, retrieves all Facebook Pages managed by the user,
   * detects associated Instagram Professional Accounts, and creates a temporary selection session.
   */
  async getPages(
    code: string,
    state: string,
    customRedirectUri?: string
  ): Promise<{
    orgId: string;
    userId: string;
    sessionKey: string;
    pages: AdministeredPageItem[];
  }> {
    return handleMetaCallback(code, state, customRedirectUri);
  },

  /**
   * Confirms the institution's official Facebook Page and linked Instagram account,
   * stores encrypted tokens on the server, and updates the public institution status.
   */
  async connectAccount(
    orgId: string,
    userId: string,
    sessionKey: string,
    selectedPageId: string
  ): Promise<PublicConnectionStatus> {
    return confirmPageSelection(orgId, userId, sessionKey, selectedPageId);
  },

  /**
   * Disconnects Facebook, Instagram, or all Meta channels for the specified institution
   */
  async disconnectAccount(
    orgId: string,
    userId: string,
    platform: 'all' | 'facebook' | 'instagram' = 'all'
  ): Promise<void> {
    return disconnectSocialAccounts(orgId, platform);
  },

  /**
   * Retrieves the current public connection status for the institution
   */
  async getStatus(orgId: string): Promise<PublicConnectionStatus> {
    return getOrganizationSocialStatus(orgId);
  },

  /**
   * Configuration check
   */
  isConfigured(): boolean {
    return isMetaConfigured();
  },

  // Prepared for Stage 2 (Publishing)
  publishToFacebook: publishToFacebookPage,
  publishToInstagram: publishToInstagram,
};
