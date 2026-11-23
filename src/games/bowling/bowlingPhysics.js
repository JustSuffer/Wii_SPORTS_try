import * as CANNON from 'cannon-es';
import * as THREE from 'three';

/**
 * 3D Rigid-Body Physics for Wii Bowling using Cannon-es
 */
export class BowlingPhysics {
  constructor(soundManager) {
    this.soundManager = soundManager;

    // Cannon World
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 14;

    // Contact Materials
    this.pinMaterial = new CANNON.Material('pin');
    this.ballMaterial = new CANNON.Material('ball');
    this.laneMaterial = new CANNON.Material('lane');

    // Ball-Pin collision
    const ballPinContact = new CANNON.ContactMaterial(this.ballMaterial, this.pinMaterial, {
      friction: 0.25,
      restitution: 0.65, // Lively bouncy pin action
    });
    this.world.addContactMaterial(ballPinContact);

    // Pin-Pin collision
    const pinPinContact = new CANNON.ContactMaterial(this.pinMaterial, this.pinMaterial, {
      friction: 0.2,
      restitution: 0.55,
    });
    this.world.addContactMaterial(pinPinContact);

    // Ball-Lane contact (slick oiled wood)
    const ballLaneContact = new CANNON.ContactMaterial(this.ballMaterial, this.laneMaterial, {
      friction: 0.08,
      restitution: 0.1,
    });
    this.world.addContactMaterial(ballLaneContact);

    // Pit Cushion Material (Energy-absorbing rear pit curtain - ZERO rebound!)
    this.pitCushionMaterial = new CANNON.Material('pitCushion');
    const ballPitContact = new CANNON.ContactMaterial(this.ballMaterial, this.pitCushionMaterial, {
      friction: 0.95,
      restitution: 0.0, // Absorb 100% of ball bounce
    });
    this.world.addContactMaterial(ballPitContact);

    // Entities
    this.pins = [];
    this.ball = null;
    this.laneLength = 22.0; // meters
    this.laneWidth = 1.05;  // meters
    this.pinDeckZ = -this.laneLength / 2;

    this.buildLane();
  }

  buildLane() {
    // 1. Bowling Lane Body (Main rolling surface)
    const laneBody = new CANNON.Body({
      mass: 0,
      material: this.laneMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(this.laneWidth / 2, 0.1, 14.0)), // 28m long!
      position: new CANNON.Vec3(0, -0.1, 0),
    });
    this.world.addBody(laneBody);

    // 2. Wide Solid Pin Deck Floor (Covers all 10 pins completely from Z = -8.5 to -13.5)
    const pinDeckFloor = new CANNON.Body({
      mass: 0,
      material: this.laneMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(1.5, 0.1, 3.0)),
      position: new CANNON.Vec3(0, -0.1, -11.0),
    });
    this.world.addBody(pinDeckFloor);

    // 3. Left Gutter
    const leftGutter = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.2, 0.1, 14.0)),
      position: new CANNON.Vec3(-this.laneWidth / 2 - 0.2, -0.12, 0),
    });
    this.world.addBody(leftGutter);

    // 4. Right Gutter
    const rightGutter = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.2, 0.1, 14.0)),
      position: new CANNON.Vec3(this.laneWidth / 2 + 0.2, -0.12, 0),
    });
    this.world.addBody(rightGutter);

    // 5. Back & Side Pit Cushion Walls (Trap pins & ball with ZERO bounce)
    const backWall = new CANNON.Body({
      mass: 0,
      material: this.pitCushionMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(2.5, 1.5, 0.3)),
      position: new CANNON.Vec3(0, 1.0, -13.2),
    });
    this.world.addBody(backWall);

    const leftPitWall = new CANNON.Body({
      mass: 0,
      material: this.pitCushionMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(0.3, 1.5, 3.0)),
      position: new CANNON.Vec3(-1.4, 1.0, -11.5),
    });
    this.world.addBody(leftPitWall);

    const rightPitWall = new CANNON.Body({
      mass: 0,
      material: this.pitCushionMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(0.3, 1.5, 3.0)),
      position: new CANNON.Vec3(1.4, 1.0, -11.5),
    });
    this.world.addBody(rightPitWall);
  }

  clearFallenPins() {
    // Sweep away fallen pins; keep upright pins neatly positioned for roll 2
    const standingPins = [];
    const fallenPinIds = [];

    for (const p of this.pins) {
      if (p.isKnockedDown) {
        this.world.removeBody(p.body);
        fallenPinIds.push(p.id);
      } else {
        // Reset standing pin to stable upright initial position and kill momentum
        p.body.position.copy(p.initialPos);
        p.body.quaternion.set(0, 0, 0, 1);
        p.body.velocity.set(0, 0, 0);
        p.body.angularVelocity.set(0, 0, 0);
        standingPins.push(p);
      }
    }

    this.pins = standingPins;
    return { standingPins, fallenPinIds };
  }

  setupPins(pinPositions) {
    // Remove existing pins
    for (const p of this.pins) {
      this.world.removeBody(p.body);
    }
    this.pins = [];

    // Pin dimensions: Height ~ 0.38m, Radius ~ 0.06m
    const pinRadius = 0.06;
    const pinHeight = 0.38;

    pinPositions.forEach((pos, index) => {
      // Create cylinder body for pin
      const body = new CANNON.Body({
        mass: 1.53, // Standard bowling pin mass: ~ 3 lbs 6 oz
        material: this.pinMaterial,
        shape: new CANNON.Cylinder(pinRadius * 0.7, pinRadius, pinHeight, 10),
        position: new CANNON.Vec3(pos.x, pinHeight / 2, pos.z),
        linearDamping: 0.15,
        angularDamping: 0.2,
      });

      // Listen for sound collision
      body.addEventListener('collide', (e) => {
        const relVel = e.contact.getImpactVelocityAlongNormal();
        if (relVel > 1.2 && this.soundManager) {
          this.soundManager.playPinHit(relVel);
        }
      });

      this.world.addBody(body);
      this.pins.push({
        id: index + 1,
        body,
        initialPos: new CANNON.Vec3(pos.x, pinHeight / 2, pos.z),
        isKnockedDown: false,
      });
    });
  }

  createBall(startX = 0) {
    if (this.ball) {
      this.world.removeBody(this.ball);
    }

    const ballRadius = 0.108; // ~ 8.5 inch diameter
    this.ball = new CANNON.Body({
      mass: 6.8, // 15 lbs standard ball
      material: this.ballMaterial,
      shape: new CANNON.Sphere(ballRadius),
      position: new CANNON.Vec3(startX, ballRadius, this.laneLength / 2 - 1.0),
      linearDamping: 0.04,
      angularDamping: 0.05,
    });

    this.world.addBody(this.ball);
    return this.ball;
  }

  launchBall(speed, hookSpin, aimAngle = 0) {
    if (!this.ball) return;

    // Base forward velocity (10 to 19 m/s)
    const forwardVel = -(11 + speed * 7.5);
    // Aim angle component
    const lateralVel = Math.tan((aimAngle * Math.PI) / 180) * Math.abs(forwardVel);

    this.ball.velocity.set(lateralVel, 0, forwardVel);

    // Apply hook spin as angular velocity around Y and Z axes
    // In bowling, hook spin creates a lateral force as it enters the dry back end
    this.hookSpin = hookSpin;
    this.ball.angularVelocity.set(0, hookSpin * 14.0, hookSpin * 8.0);
  }

  update(delta) {
    // Step Cannon physics
    this.world.step(1 / 60, delta, 3);

    // Trap bowling ball dead in the rear pit: NEVER allow it to bounce forward back down the lane!
    if (this.ball && this.ball.position.z < -11.4) {
      if (this.ball.velocity.z > 0) {
        this.ball.velocity.z = 0; // Absolute block on forward rebound
      }
      if (this.ball.position.z < -11.9) {
        this.ball.velocity.set(0, -2.5, 0); // Drop down into collection cavity
        this.ball.angularVelocity.set(0, 0, 0);
      }
    }

    // Apply progressive hook curve to ball as it travels towards pins
    if (this.ball && this.hookSpin) {
      // In last 35% of lane, friction causes spin to bite the wood (Hook curve)
      const progress = (this.laneLength / 2 - this.ball.position.z) / this.laneLength;
      if (progress > 0.55 && progress < 0.95) {
        const hookForce = this.hookSpin * 9.5;
        this.ball.applyForce(new CANNON.Vec3(hookForce, 0, 0), this.ball.position);
      }
    }

    // Check knocked down pins
    let fallenCount = 0;
    for (const p of this.pins) {
      if (!p.isKnockedDown) {
        // Pin is considered knocked down if tilted > 42 degrees or moved significantly
        const upVec = new CANNON.Vec3(0, 1, 0);
        const pinUp = p.body.quaternion.vmult(upVec);
        const dot = pinUp.dot(upVec); // Cosine of tilt angle

        if (dot < 0.72 || p.body.position.y < 0.08 || Math.abs(p.body.position.x) > 1.2) {
          p.isKnockedDown = true;
          fallenCount++;
        }
      } else {
        fallenCount++;
      }
    }

    return fallenCount;
  }
}
