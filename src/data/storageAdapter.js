/**
 * Adapter for the browser's existing localStorage.
 *
 * Keeping the browser global in this module lets repositories use a small,
 * replaceable storage boundary without changing the current storage format.
 */
export const localStorageAdapter = {
  getItem(key){
    return window.localStorage.getItem(key);
  },

  setItem(key, value){
    return window.localStorage.setItem(key, value);
  },

  removeItem(key){
    return window.localStorage.removeItem(key);
  },
};
