export const showToast = (message, type = 'info', duration = 4000) => {
  window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type, duration } }));
};
