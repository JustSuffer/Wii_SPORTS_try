import * as THREE from 'three';

/**
 * Wii Motion Processing & Gesture Detection Engine
 * Translates iPhone IMU sensor data (accel, gyro, orientation) into:
 * 1. 3D Orientation (Quaternion for 1:1 Wiimote rendering)
 * 2. Pointer Cursor (X, Y for menu navigation)
 * 3. Tennis Swing Detection (Forehand/Backhand, Speed, Topspin/Slice)
 * 4. Bowling Release Detection (Swing speed, Twist/Spin, Release timing)
 */
export class MotionEngine {
  constructor() {
    this.currentQuaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

    // Butter-smooth dynamic pointer tracking
    this.pointerX = 0.5;
    this.pointerY = 0.5;
    this.smoothedX = 0.5;
    this.smoothedY = 0.5;

    // Calibration centers (Set on initial packet or when player taps "Ortala")
    this.calibratedPitch = null;
    this.calibratedYaw = null;

    // Natural Wii-like angular spans:
    // ~28° wrist pan covers 100% of horizontal screen width
    // ~22° wrist tilt covers 100% of vertical screen height
    this.yawSpan = 28.0;
    this.pitchSpan = 22.0;
    this.sensitivityScale = 1.0;

    // Swing detection state
    this.isSwinging = false;
    this.swingPeakAcc = 0;
    this.swingStartTime = 0;
    this.recentAccHistory = [];
    this.historySize = 12;

    // Bowling specific state
    this.wasBPressed = false;
    this.bPressStartTime = 0;
    this.maxBackswingAcc = 0;

    // Callbacks
    this.onSwing = null;
    this.onBowlingRelease = null;
    this.onButtonChange = null;
    this.onPointerMove = null;

    this.buttons = {};
  }

  setSensitivity(mode) {
    if (mode === 'ultra') {
      this.sensitivityScale = 1.4;
    } else if (mode === 'normal') {
      this.sensitivityScale = 0.8;
    } else {
      // 'high' (ideal Wii feel)
      this.sensitivityScale = 1.05;
    }
  }

  recenter(pitch, yaw) {
    if (typeof pitch === 'number' && !isNaN(pitch)) {
      this.calibratedPitch = pitch;
    }
    if (typeof yaw === 'number' && !isNaN(yaw)) {
      this.calibratedYaw = yaw;
    }
    this.pointerX = 0.5;
    this.pointerY = 0.5;
    this.smoothedX = 0.5;
    this.smoothedY = 0.5;
  }

  processPacket(packet) {
    if (!packet) return;

    const { acc, linAcc, gyro, orient, buttons } = packet;

    // 1. Process 3D Orientation & Dynamic Air-Mouse Pointer
    if (orient) {
      const alpha = Number(orient.alpha || 0); // Yaw (0..360)
      const beta = Number(orient.beta || 0);   // Pitch (-180..180)
      const gamma = Number(orient.gamma || 0); // Roll (-90..90)

      // Auto-calibrate on first incoming packet
      if (this.calibratedPitch === null) {
        this.calibratedPitch = beta;
        this.calibratedYaw = alpha;
      }

      // Convert to Three.js orientation for 3D Wiimote
      const radAlpha = THREE.MathUtils.degToRad(alpha - (this.calibratedYaw || 0));
      const radBeta = THREE.MathUtils.degToRad(beta);
      const radGamma = THREE.MathUtils.degToRad(gamma);

      this.euler.set(radBeta, -radAlpha, -radGamma, 'YXZ');
      this.currentQuaternion.setFromEuler(this.euler);

      // --- CALCULATE ACCURATE SCREEN POINTER ---
      // X-AXIS (SOL / SAĞ):
      // On iOS Safari, rotating the phone to the RIGHT decreases compass alpha
      // Therefore, minus diffYaw moves the cursor to the RIGHT.
      let diffYaw = alpha - (this.calibratedYaw || 0);
      if (diffYaw > 180) diffYaw -= 360;
      if (diffYaw < -180) diffYaw += 360;

      const rawTargetX = 0.5 - (diffYaw / this.yawSpan) * this.sensitivityScale * 0.5;

      // Y-AXIS (YUKARI / AŞAĞI):
      // Tilting top of phone UP increases beta.
      // In screen coords, top is Y=0, so positive diffPitch decreases targetY (moves UP).
      const diffPitch = beta - (this.calibratedPitch || 0);
      const rawTargetY = 0.5 - (diffPitch / this.pitchSpan) * this.sensitivityScale * 0.5;

      const clampedX = THREE.MathUtils.clamp(rawTargetX, 0.01, 0.99);
      const clampedY = THREE.MathUtils.clamp(rawTargetY, 0.01, 0.99);

      // Dynamic Adaptive Filter (Smooth when steady, instant when moving fast):
      const deltaDist = Math.hypot(clampedX - this.smoothedX, clampedY - this.smoothedY);
      const dynamicFactor = THREE.MathUtils.clamp(0.25 + deltaDist * 1.5, 0.25, 0.75);

      this.smoothedX += (clampedX - this.smoothedX) * dynamicFactor;
      this.smoothedY += (clampedY - this.smoothedY) * dynamicFactor;

      this.pointerX = this.smoothedX;
      this.pointerY = this.smoothedY;

      if (this.onPointerMove) {
        this.onPointerMove(this.pointerX, this.pointerY);
      }
    }

    // 2. Track Linear Acceleration
    const lx = linAcc ? linAcc.x : 0;
    const ly = linAcc ? linAcc.y : 0;
    const lz = linAcc ? linAcc.z : 0;
    const totalLinAcc = Math.sqrt(lx * lx + ly * ly + lz * lz);

    const now = performance.now();
    this.recentAccHistory.push({ time: now, acc: totalLinAcc, lx, ly, lz, gyro, orient });
    if (this.recentAccHistory.length > this.historySize) {
      this.recentAccHistory.shift();
    }

    // 3. Tennis Swing Detection Algorithm
    this.detectTennisSwing(totalLinAcc, lx, ly, lz, gyro, orient, now);

    // 4. Bowling Release Detection Algorithm
    if (buttons) {
      this.detectBowlingRelease(buttons, totalLinAcc, lx, ly, lz, gyro, orient, now);
      this.updateButtons(buttons);
    }
  }

  detectTennisSwing(totalAcc, lx, ly, lz, gyro, orient, now) {
    const SWING_START_THRESHOLD = 8.5; // Responsive threshold
    const SWING_MIN_PEAK = 10.0;

    if (!this.isSwinging && totalAcc > SWING_START_THRESHOLD) {
      this.isSwinging = true;
      this.swingStartTime = now;
      this.swingPeakAcc = totalAcc;
    } else if (this.isSwinging) {
      if (totalAcc > this.swingPeakAcc) {
        this.swingPeakAcc = totalAcc;
      }

      // Swing completion
      if (totalAcc < 5.0 || now - this.swingStartTime > 400) {
        this.isSwinging = false;

        if (this.swingPeakAcc >= SWING_MIN_PEAK) {
          const samples = this.recentAccHistory;
          let avgLx = 0;
          let avgLy = 0;
          let avgRollRate = 0;

          for (const s of samples) {
            avgLx += s.lx;
            avgLy += s.ly;
            if (s.gyro) avgRollRate += s.gyro.gamma || 0;
          }
          avgLx /= samples.length || 1;
          avgLy /= samples.length || 1;
          avgRollRate /= samples.length || 1;

          const isForehand = avgLx < 0;

          let spin = 'flat';
          if (avgRollRate > 80 || avgLy > 3) {
            spin = 'topspin';
          } else if (avgRollRate < -80 || avgLy < -3) {
            spin = 'slice';
          }

          const power = THREE.MathUtils.clamp((this.swingPeakAcc - 10) / 20, 0.35, 1.0);

          if (this.onSwing) {
            this.onSwing({
              type: isForehand ? 'forehand' : 'backhand',
              spin: spin,
              power: power,
              speedKmh: Math.round(power * 130 + 50),
              timestamp: now,
            });
          }
        }
      }
    }
  }

  detectBowlingRelease(buttons, totalAcc, lx, ly, lz, gyro, orient, now) {
    const isBPressed = !!buttons.B;

    if (isBPressed && !this.wasBPressed) {
      this.bPressStartTime = now;
      this.maxBackswingAcc = 0;
    } else if (isBPressed) {
      if (totalAcc > this.maxBackswingAcc) {
        this.maxBackswingAcc = totalAcc;
      }
    } else if (!isBPressed && this.wasBPressed) {
      // B was released: ALWAYS THROW THE BALL!
      let peakForwardAcc = this.maxBackswingAcc;
      for (const s of this.recentAccHistory) {
        if (s.acc > peakForwardAcc) {
          peakForwardAcc = s.acc;
        }
      }

      let releaseRoll = 0;
      let releaseYaw = 0;
      if (orient) {
        releaseRoll = orient.gamma || 0;
        releaseYaw = orient.alpha || 0;
      }

      // Wrist twist for hook curve (-1.0 to 1.0)
      const hookSpin = THREE.MathUtils.clamp(-releaseRoll / 35, -1.0, 1.0);
      // Normalized speed: 0.3 to 1.0 (defaults to 0.6 even if gentle release)
      const normalizedSpeed = THREE.MathUtils.clamp((peakForwardAcc - 4) / 18, 0.45, 1.0);

      if (this.onBowlingRelease) {
        this.onBowlingRelease({
          speed: normalizedSpeed,
          hookSpin: hookSpin,
          yawAngle: releaseYaw,
          timestamp: now,
        });
      }
    }

    this.wasBPressed = isBPressed;
  }

  updateButtons(newButtons) {
    for (const [key, val] of Object.entries(newButtons)) {
      if (this.buttons[key] !== val) {
        this.buttons[key] = val;
        if (this.onButtonChange) {
          this.onButtonChange(key, val);
        }
      }
    }
  }
}
