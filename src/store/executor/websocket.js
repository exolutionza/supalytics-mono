// websocket-service.js

/**
 * Enhanced WebSocket service with improved error handling, debugging,
 * and handler lifecycle management.
 */
class WebSocketService {
  constructor() {
    // Core websocket state
    this.socket = null;
    this.url = null;
    this.isConnecting = false;
    this.connectionPromise = null;
    
    // Stream handlers and cleanup tracking
    this.streamHandlers = new Map();
    this.recentlyRemovedHandlers = new Map(); // For debugging
    this.handlerCleanupTimeouts = new Map();
    
    // Reconnection configuration
    this.autoReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Base delay in ms
    this.currentReconnectTimeout = null;
    
    // Handler cleanup configuration
    this.handlerCleanupDelay = 5000; // 5 second grace period
    this.recentlyRemovedTTL = 60000; // Keep removed handlers in history for 1 minute

    // Bind methods to maintain context
    this.handleMessage = this.handleMessage.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
    this.cleanupHandler = this.cleanupHandler.bind(this);
  }

  /**
   * Get or establish a WebSocket connection
   * @param {string} [url] - WebSocket URL
   * @returns {Promise<WebSocket>}
   */
  async getConnection(url) {
    // Update URL if provided
    if (url && url !== this.url) {
      this.url = url;
    }

    // Return existing connection if available
    if (this.socket?.readyState === WebSocket.OPEN) {
      return this.socket;
    }

    // Return pending connection if one is in progress
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (!this.url) {
      throw new Error('WebSocket URL not provided');
    }

    this.connectionPromise = this.establishConnection();
    return this.connectionPromise;
  }

  /**
   * Establish a new WebSocket connection
   * @returns {Promise<WebSocket>}
   */
  establishConnection() {
    return new Promise((resolve, reject) => {
      try {
        console.log('[WebSocketService] Establishing connection to:', this.url);
        this.socket = new WebSocket(this.url);
        
        this.socket.onopen = () => {
          console.log('[WebSocketService] Connected successfully');
          this.reconnectAttempts = 0;
          this.connectionPromise = null;
          resolve(this.socket);
        };

        this.socket.onmessage = this.handleMessage;
        this.socket.onclose = this.handleClose;
        this.socket.onerror = this.handleError;

      } catch (error) {
        console.error('[WebSocketService] Connection error:', error);
        this.connectionPromise = null;
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {MessageEvent} event 
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      const { streamId } = message;
      const handler = this.streamHandlers.get(streamId);

      if (handler) {
        console.debug(`[WebSocketService] Processing message for streamId: ${streamId}`, message.type);
        handler(message);

        // Schedule handler cleanup if message indicates completion
        if (this.shouldCleanupHandler(message)) {
          this.scheduleHandlerCleanup(streamId);
        }
      } else {
        const removedAt = this.recentlyRemovedHandlers.get(streamId);
        if (removedAt) {
          const timeSinceRemoval = Date.now() - removedAt;
          console.warn(
            `[WebSocketService] Late message received: Handler for streamId ${streamId} ` +
            `was removed ${timeSinceRemoval}ms ago. Message type: ${message.type}`
          );
        } else {
          console.warn(
            `[WebSocketService] No handler found for streamId: ${streamId}. ` +
            `Message type: ${message.type}`
          );
        }
      }
    } catch (error) {
      console.error('[WebSocketService] Error handling message:', error);
    }
  }

  /**
   * Handle WebSocket connection closure
   * @param {CloseEvent} event 
   */
  handleClose(event) {
    console.warn(
      `[WebSocketService] Connection closed. Code: ${event.code}, ` +
      `Reason: ${event.reason || 'No reason provided'}`
    );
    
    this.socket = null;

    // Notify all active handlers about connection close
    this.streamHandlers.forEach((handler, streamId) => {
      handler({ 
        type: 'error',
        streamId: 'system',
        payload: { 
          error: 'WebSocket connection closed',
          code: event.code,
          reason: event.reason
        }
      });
    });

    if (this.autoReconnect && !event.wasClean) {
      this.attemptReconnect();
    }
  }

  /**
   * Handle WebSocket errors
   * @param {Event} error 
   */
  handleError(error) {
    console.error('[WebSocketService] Socket error:', error);
    
    this.streamHandlers.forEach((handler, streamId) => {
      handler({ 
        type: 'error',
        streamId: 'system',
        payload: { error: 'WebSocket connection error' }
      });
    });
  }

  /**
   * Execute a query through the WebSocket connection
   * @param {string} url - WebSocket URL
   * @param {string} queryId - Query identifier
   * @param {object} parameters - Query parameters
   * @param {string} streamId - Stream identifier
   * @param {Function} messageHandler - Message handler function
   * @returns {Function} Cleanup function
   */
  async executeQuery(url, queryId, parameters, streamId, messageHandler) {
    try {
      const socket = await this.getConnection(url);
      
      console.log(`[WebSocketService] Executing query ${queryId} with streamId: ${streamId}`);
      
      // Register message handler
      this.streamHandlers.set(streamId, messageHandler);
      console.log(`[WebSocketService] Registered handler for streamId: ${streamId}`);

      // Construct and send query request
      const request = {
        type: 'query',
        queryId,
        streamId,
        templateData: parameters
      };

      socket.send(JSON.stringify(request));

      // Return cleanup function
      return () => {
        console.log(`[WebSocketService] Cleaning up query execution for streamId: ${streamId}`);
        if (this.streamHandlers.has(streamId)) {
          this.cancelQuery(streamId);
          this.cleanupHandler(streamId);
        }
      };

    } catch (error) {
      console.error(`[WebSocketService] Failed to execute query: ${error.message}`);
      throw new Error(`Failed to execute query: ${error.message}`);
    }
  }

  /**
   * Cancel an active query
   * @param {string} streamId 
   */
  async cancelQuery(streamId) {
    try {
      const socket = await this.getConnection();
      
      console.log(`[WebSocketService] Cancelling query for streamId: ${streamId}`);
      
      const request = {
        type: 'cancel',
        streamId
      };

      socket.send(JSON.stringify(request));
    } catch (error) {
      console.error('[WebSocketService] Failed to cancel query:', error);
    }
  }

  /**
   * Check if a handler should be cleaned up based on message type
   * @param {object} message 
   * @returns {boolean}
   */
  shouldCleanupHandler(message) {
    return (
      message.type === 'complete' || 
      message.type === 'error' || 
      (message.type === 'status' && 
       ['completed', 'failed', 'cancelled'].includes(message.payload?.status))
    );
  }

  /**
   * Schedule handler cleanup with grace period
   * @param {string} streamId 
   */
  scheduleHandlerCleanup(streamId) {
    // Clear any existing cleanup timeout
    if (this.handlerCleanupTimeouts.has(streamId)) {
      clearTimeout(this.handlerCleanupTimeouts.get(streamId));
    }

    // Schedule new cleanup
    const timeoutId = setTimeout(() => {
      this.cleanupHandler(streamId);
      this.handlerCleanupTimeouts.delete(streamId);
    }, this.handlerCleanupDelay);

    this.handlerCleanupTimeouts.set(streamId, timeoutId);
  }

  /**
   * Clean up a message handler
   * @param {string} streamId 
   */
  cleanupHandler(streamId) {
    if (this.streamHandlers.has(streamId)) {
      console.log(`[WebSocketService] Removing handler for streamId: ${streamId}`);
      
      // Track recently removed handlers
      this.recentlyRemovedHandlers.set(streamId, Date.now());
      
      // Clean up after TTL
      setTimeout(() => {
        this.recentlyRemovedHandlers.delete(streamId);
      }, this.recentlyRemovedTTL);

      // Remove the handler
      this.streamHandlers.delete(streamId);
    }
  }

  /**
   * Attempt to reconnect to the WebSocket server
   */
  attemptReconnect() {
    if (!this.autoReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(
        '[WebSocketService] Max reconnect attempts reached or auto-reconnect disabled'
      );
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay * (2 ** (this.reconnectAttempts - 1));

    console.log(
      `[WebSocketService] Attempting reconnect #${this.reconnectAttempts} ` +
      `in ${delay}ms...`
    );

    this.currentReconnectTimeout = setTimeout(() => {
      this.getConnection().catch(err => {
        console.error('[WebSocketService] Reconnect failed:', err);
      });
    }, delay);
  }

  /**
   * Close the WebSocket connection and clean up resources
   */
  close() {
    console.log('[WebSocketService] Closing service...');
    
    // Clear reconnection state
    if (this.currentReconnectTimeout) {
      clearTimeout(this.currentReconnectTimeout);
      this.currentReconnectTimeout = null;
    }

    // Clear all handler cleanup timeouts
    this.handlerCleanupTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.handlerCleanupTimeouts.clear();

    // Reset service state
    this.autoReconnect = false;
    this.reconnectAttempts = 0;
    this.streamHandlers.clear();
    this.recentlyRemovedHandlers.clear();

    // Close socket if active
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();