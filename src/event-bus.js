export class EventBus extends EventTarget {
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, listener) {
    const handler = (event) => listener(event.detail);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }
}
