export const testIds = {
  auth: {
    loginPage: 'auth-login-page',
    loginUsernameInput: 'auth-login-username-input',
    loginPasswordInput: 'auth-login-password-input',
    loginSubmitButton: 'auth-login-submit-button',
    loginError: 'auth-login-error',
    logoutButton: 'auth-logout-button',
  },
  providers: {
    page: 'providers-page',
    addButton: 'providers-add-button',
    modal: 'providers-modal',
    providerSelect: 'providers-provider-select',
    labelInput: 'providers-label-input',
    keyInput: 'providers-key-input',
    saveButton: 'providers-save-button',
    list: 'providers-list',
    row: (id: string) => `providers-row-${id}`,
    rowToggle: (id: string) => `providers-row-toggle-${id}`,
    rowDelete: (id: string) => `providers-row-delete-${id}`,
  },
};

export const authStorageKeys = {
  session: 'br_auth_session',
};
