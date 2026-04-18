// EventBus.js
class EventBus {
  constructor() {
    this.mailboxes = {};
  }

  register(name, handler) {
    this.mailboxes[name] = handler;
  }

  unregister(name) {
    delete this.mailboxes[name];
  }

  // Send a message to all EXCEPT the sender
  broadcast(from, content) {
    const message = { from, content, timestamp: Date.now() };
    Object.entries(this.mailboxes).forEach(([name, handler]) => {
      if (name !== from) {
        handler(message);
      }
    });
  }
}

export const eventBus = new EventBus();
