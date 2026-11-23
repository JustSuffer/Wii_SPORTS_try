import * as THREE from 'three';

/**
 * Procedural 3D Mii Character Generator
 * Emulates the iconic Wii Sports Mii aesthetic:
 * Spherical head, floating hands, capsule body, floating shoes.
 */
export class MiiAvatar {
  constructor(options = {}) {
    this.color = options.color || 0x0084ff; // Player shirt color
    this.skinColor = options.skinColor || 0xffdbac; // Peach skin tone
    this.hairColor = options.hairColor || 0x4a2e18; // Brown hair
    this.isOpponent = options.isOpponent || false;

    this.group = new THREE.Group();
    this.buildMii();
  }

  buildMii() {
    // 1. Torso / Body (Capsule/tapered cylinder)
    const bodyGeo = new THREE.CylinderGeometry(0.28, 0.38, 0.75, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.4,
    });
    this.torso = new THREE.Mesh(bodyGeo, bodyMat);
    this.torso.position.y = 1.0;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Collar / Neck ring
    const collarGeo = new THREE.TorusGeometry(0.26, 0.05, 12, 24);
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.38;
    this.group.add(collar);

    // 2. Head (Sphere)
    const headGeo = new THREE.SphereGeometry(0.48, 24, 24);
    const skinMat = new THREE.MeshStandardMaterial({
      color: this.skinColor,
      roughness: 0.5,
    });
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.position.y = 1.82;
    this.head.castShadow = true;
    this.group.add(this.head);

    // Hair
    const hairGeo = new THREE.SphereGeometry(0.51, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.7);
    const hairMat = new THREE.MeshStandardMaterial({
      color: this.hairColor,
      roughness: 0.7,
    });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 1.84;
    hair.rotation.x = -0.1;
    this.group.add(hair);

    // Eyes (Two dark oval spheres)
    const eyeGeo = new THREE.SphereGeometry(0.065, 12, 12);
    eyeGeo.scale(1, 1.4, 0.5);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.16, 1.84, 0.44);
    this.group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.16, 1.84, 0.44);
    this.group.add(rightEye);

    // Cheerful smile
    const smileGeo = new THREE.TorusGeometry(0.12, 0.025, 8, 16, Math.PI * 0.8);
    const smileMat = new THREE.MeshBasicMaterial({ color: 0x442222 });
    const smile = new THREE.Mesh(smileGeo, smileMat);
    smile.position.set(0, 1.66, 0.44);
    smile.rotation.x = 0.2;
    this.group.add(smile);

    // 3. Iconic Wii Floating Spherical Hands
    const handGeo = new THREE.SphereGeometry(0.13, 16, 16);
    const handMat = new THREE.MeshStandardMaterial({
      color: this.skinColor,
      roughness: 0.4,
    });

    this.leftHand = new THREE.Mesh(handGeo, handMat);
    this.leftHand.position.set(-0.55, 0.95, 0.15);
    this.leftHand.castShadow = true;
    this.group.add(this.leftHand);

    this.rightHand = new THREE.Mesh(handGeo, handMat);
    this.rightHand.position.set(0.55, 0.95, 0.15);
    this.rightHand.castShadow = true;
    this.group.add(this.rightHand);

    // 4. Floating Feet/Shoes
    const footGeo = new THREE.SphereGeometry(0.15, 16, 16);
    footGeo.scale(1, 0.7, 1.5);
    const footMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
    });

    this.leftFoot = new THREE.Mesh(footGeo, footMat);
    this.leftFoot.position.set(-0.25, 0.12, 0);
    this.leftFoot.castShadow = true;
    this.group.add(this.leftFoot);

    this.rightFoot = new THREE.Mesh(footGeo, footMat);
    this.rightFoot.position.set(0.25, 0.12, 0);
    this.rightFoot.castShadow = true;
    this.group.add(this.rightFoot);

    // Tennis Racket (Initially hidden, attached to right hand)
    this.racketGroup = new THREE.Group();
    this.buildTennisRacket();
    this.rightHand.add(this.racketGroup);
    this.racketGroup.visible = false;
  }

  buildTennisRacket() {
    // Grip handle
    const gripGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.y = 0.22;
    this.racketGroup.add(grip);

    // Rim hoop
    const hoopGeo = new THREE.TorusGeometry(0.28, 0.035, 12, 32);
    const hoopMat = new THREE.MeshStandardMaterial({ color: 0x0099ff, roughness: 0.3 });
    const hoop = new THREE.Mesh(hoopGeo, hoopMat);
    hoop.position.y = 0.65;
    this.racketGroup.add(hoop);

    // Strings (translucent plane)
    const stringsGeo = new THREE.CircleGeometry(0.27, 24);
    const stringsMat = new THREE.MeshBasicMaterial({
      color: 0xeeeeee,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const strings = new THREE.Mesh(stringsGeo, stringsMat);
    strings.position.y = 0.65;
    this.racketGroup.add(strings);
  }

  setEquipment(type) {
    if (type === 'tennis') {
      this.racketGroup.visible = true;
    } else {
      this.racketGroup.visible = false;
    }
  }

  // Idle breathing / foot shuffle animation
  update(time) {
    const breathe = Math.sin(time * 3) * 0.02;
    this.torso.position.y = 1.0 + breathe;
    this.head.position.y = 1.82 + breathe;
    this.leftHand.position.y = 0.95 + Math.sin(time * 3 + 0.5) * 0.03;
    this.rightHand.position.y = 0.95 + Math.sin(time * 3 - 0.5) * 0.03;
  }

  // Play swing animation (tennis or bowling)
  playSwing(isForehand = true, duration = 0.35) {
    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / (duration * 1000);
      if (elapsed < 1.0) {
        const t = Math.sin(elapsed * Math.PI);
        this.rightHand.position.x = 0.55 + (isForehand ? -0.8 : 0.8) * t;
        this.rightHand.position.z = 0.15 + t * 0.7;
        this.rightHand.position.y = 0.95 + t * 0.4;
        requestAnimationFrame(animate);
      } else {
        this.rightHand.position.set(0.55, 0.95, 0.15);
      }
    };
    animate();
  }
}
