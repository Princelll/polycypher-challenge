// ============================================================
// BioLoop Frame BLE Integration Layer
// Uses frame-msg for high-level Frame G2 communication
// ============================================================

import { FrameMsg, StdLua, RxTap, AsyncQueue } from 'frame-msg';
import type { ConfidenceRating } from '../core/models';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface FrameEvents {
  onStatusChange: (status: ConnectionStatus) => void;
  onTap: (rating: ConfidenceRating) => void;
  onLog: (message: string) => void;
}

/**
 * Frame BLE connection manager.
 * Handles connecting to Frame G2 glasses, displaying cards,
 * and receiving tap input for confidence ratings.
 */
export class FrameConnection {
  private frame: FrameMsg | null = null;
  private status: ConnectionStatus = 'disconnected';
  private events: FrameEvents;
  private rxTap: RxTap | null = null;
  private tapQueue: AsyncQueue<number> | null = null;
  private tapListenerActive = false;

  constructor(events: FrameEvents) {
    this.events = events;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.events.onStatusChange(status);
  }

  private log(msg: string) {
    this.events.onLog(`[Frame] ${msg}`);
  }

  /**
   * Connect to Frame G2 via Web Bluetooth.
   * Triggers browser's Bluetooth device picker.
   */
  async connect(): Promise<boolean> {
    try {
      this.setStatus('connecting');
      this.log('Requesting Bluetooth device...');

      this.frame = new FrameMsg();

      await this.frame.connect();
      this.log('Connected to Frame G2');

      // Upload standard Lua libraries for plain text and tap
      await this.frame.uploadStdLuaLibs([StdLua.PlainTextMin, StdLua.TapMin]);
      this.log('Uploaded Lua libraries');

      // Set up tap listener
      await this.setupTapListener();

      this.setStatus('connected');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`Connection failed: ${msg}`);
      this.setStatus('error');
      return false;
    }
  }

  /**
   * Disconnect from Frame.
   */
  async disconnect(): Promise<void> {
    this.tapListenerActive = false;
    if (this.rxTap && this.frame) {
      this.rxTap.detach(this.frame);
      this.rxTap = null;
      this.tapQueue = null;
    }
    if (this.frame) {
      try {
        await this.frame.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.frame = null;
    }
    this.setStatus('disconnected');
    this.log('Disconnected');
  }

  /**
   * Display text on Frame glasses using printShortText (simple Lua-based display).
   */
  async displayText(text: string): Promise<void> {
    if (!this.frame || this.status !== 'connected') {
      this.log('Not connected — cannot display text');
      return;
    }

    try {
      await this.frame.printShortText(text);
      this.log(`Displayed: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`Display error: ${msg}`);
    }
  }

  /**
   * Display a flashcard on Frame.
   */
  async displayCard(front: string, _back: string): Promise<void> {
    await this.displayText(front);
  }

  /**
   * Show the answer (back of card) on Frame.
   */
  async showAnswer(back: string): Promise<void> {
    await this.displayText(back);
  }

  /**
   * Clear the Frame display.
   */
  async clearDisplay(): Promise<void> {
    if (!this.frame || this.status !== 'connected') return;
    try {
      await this.frame.printShortText('');
    } catch {
      // ignore
    }
  }

  /**
   * Display session feedback on Frame.
   */
  async displayFeedback(message: string): Promise<void> {
    await this.displayText(message);
  }

  /**
   * Set up tap gesture recognition using RxTap's built-in debouncing.
   * RxTap queues tap counts: 1=single, 2=double, 3=triple.
   * Mapping: 1 tap = "good", 2 taps = "again", 3+ taps = "easy"
   */
  private async setupTapListener(): Promise<void> {
    if (!this.frame) return;

    this.rxTap = new RxTap({ threshold: 0.4 });
    this.tapQueue = await this.rxTap.attach(this.frame);
    this.tapListenerActive = true;

    this.log('Tap listener active — 1 tap=good, 2 taps=again, 3 taps=easy');

    // Start consuming tap events in background
    this.consumeTapEvents();
  }

  /**
   * Continuously consume tap events from the RxTap queue.
   */
  private async consumeTapEvents(): Promise<void> {
    while (this.tapListenerActive && this.tapQueue) {
      try {
        const tapCount = await this.tapQueue.get();
        if (!this.tapListenerActive) break;

        let rating: ConfidenceRating;
        if (tapCount === 1) {
          rating = 'good';
        } else if (tapCount === 2) {
          rating = 'again';
        } else {
          rating = 'easy';
        }

        this.log(`Tap detected: ${tapCount} tap(s) → ${rating}`);
        this.events.onTap(rating);
      } catch {
        // Queue may be cleared on disconnect
        break;
      }
    }
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }
}
