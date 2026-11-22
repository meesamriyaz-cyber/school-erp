import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "school-erp-mobile-refresh-token";

export const secureStorage = {
  async getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(token) {
    if (!token) return this.clearRefreshToken();
    return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },
  async clearRefreshToken() {
    return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
