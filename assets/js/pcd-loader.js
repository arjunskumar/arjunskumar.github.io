/* ==========================================================================
   PCD Loader & Point Cloud Parser (Supports Binary & ASCII PCL v0.7)
   Parses real-world 3D LiDAR SLAM binary maps (Float32Array) in milliseconds
   Supports direct embedded buffer loading for 100% file:/// CORS compatibility
   ========================================================================== */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PCDLoader = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function parseHeader(headerText) {
    const lines = headerText.split('\n');
    const header = {
      version: 0.7,
      fields: [],
      size: [],
      type: [],
      count: [],
      width: 0,
      height: 1,
      points: 0,
      data: 'ascii',
      headerLen: 0
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split(/\s+/);
      const field = parts[0].toUpperCase();

      if (field === 'VERSION') header.version = parseFloat(parts[1]);
      else if (field === 'FIELDS') header.fields = parts.slice(1).map((s) => s.toLowerCase());
      else if (field === 'SIZE') header.size = parts.slice(1).map(Number);
      else if (field === 'TYPE') header.type = parts.slice(1);
      else if (field === 'COUNT') header.count = parts.slice(1).map(Number);
      else if (field === 'WIDTH') header.width = parseInt(parts[1], 10);
      else if (field === 'HEIGHT') header.height = parseInt(parts[1], 10);
      else if (field === 'POINTS') header.points = parseInt(parts[1], 10);
      else if (field === 'DATA') {
        header.data = parts[1].toLowerCase();
        break;
      }
    }

    if (header.points === 0 && header.width > 0) {
      header.points = header.width * header.height;
    }

    return header;
  }

  function parseBinaryPCD(buffer, header, dataOffset, stride) {
    stride = stride || 1;
    const fieldCount = header.fields.length || 4;
    const xIdx = header.fields.indexOf('x') !== -1 ? header.fields.indexOf('x') : 0;
    const yIdx = header.fields.indexOf('y') !== -1 ? header.fields.indexOf('y') : 1;
    const zIdx = header.fields.indexOf('z') !== -1 ? header.fields.indexOf('z') : 2;
    const iIdx = header.fields.indexOf('intensity');

    // dataOffset (header length) is not 4-byte aligned, so copy before viewing as float32
    const dataBytes = buffer.slice(dataOffset);
    const floatView = new Float32Array(dataBytes, 0, Math.floor(dataBytes.byteLength / 4));
    const totalPoints = Math.floor(floatView.length / fieldCount);
    const loadedCount = Math.floor(totalPoints / stride);

    const positions = new Float32Array(loadedCount * 3);
    const intensities = new Float32Array(loadedCount);

    let validCount = 0;
    for (let p = 0; p < totalPoints; p += stride) {
      const offset = p * fieldCount;
      const x = floatView[offset + xIdx];
      const y = floatView[offset + yIdx];
      const z = floatView[offset + zIdx];
      const intensity = iIdx !== -1 ? floatView[offset + iIdx] : 0.0;

      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        const outIdx = validCount * 3;
        positions[outIdx] = x;
        positions[outIdx + 1] = y;
        positions[outIdx + 2] = z;
        intensities[validCount] = isFinite(intensity) ? intensity : 0.0;
        validCount++;
      }
    }

    const finalPositions = validCount === loadedCount ? positions : positions.subarray(0, validCount * 3);
    const finalIntensities = validCount === loadedCount ? intensities : intensities.subarray(0, validCount);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
    geometry.setAttribute('intensity', new THREE.BufferAttribute(finalIntensities, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return {
      geometry: geometry,
      pointCount: validCount,
      isBinary: true,
      rawPoints: totalPoints
    };
  }

  function parseAsciiPCD(text) {
    const lines = text.split('\n');
    let dataSection = false;
    const positions = [];
    const intensities = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (!dataSection) {
        if (line.toUpperCase().startsWith('DATA ASCII')) {
          dataSection = true;
        }
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        const intensity = parts.length >= 4 ? parseFloat(parts[3]) : 0.0;

        if (isFinite(x) && isFinite(y) && isFinite(z)) {
          positions.push(x, y, z);
          intensities.push(isFinite(intensity) ? intensity : 0.0);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('intensity', new THREE.Float32BufferAttribute(intensities, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return {
      geometry: geometry,
      pointCount: positions.length / 3,
      isBinary: false
    };
  }

  function parseArrayBuffer(buffer, stride) {
    const headerChunk = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2048));
    const headerText = new TextDecoder('ascii').decode(headerChunk);

    const dataPos = headerText.search(/DATA\s+(binary|ascii)/i);
    if (dataPos === -1) {
      throw new Error('Invalid PCD: DATA keyword not found');
    }

    const newlinePos = headerText.indexOf('\n', dataPos);
    const dataOffset = newlinePos + 1;
    const header = parseHeader(headerText.substring(0, newlinePos));

    if (header.data === 'binary') {
      return parseBinaryPCD(buffer, header, dataOffset, stride);
    } else {
      const fullText = new TextDecoder('ascii').decode(buffer);
      return parseAsciiPCD(fullText);
    }
  }

  function generateWarehousePoints() {
    const positions = [];
    const intensities = [];

    for (let i = 0; i < 5000; i++) {
      const x = (Math.random() - 0.5) * 50.0;
      const y = (Math.random() - 0.5) * 28.0;
      const z = (Math.random() - 0.5) * 0.03;
      const isGuide = (Math.abs(y - (-1.8)) < 0.1 || Math.abs(y - 1.8) < 0.1) && Math.abs(x) < 22;
      positions.push(x, y, z);
      intensities.push(isGuide ? 0.95 : 0.25 + Math.random() * 0.15);
    }

    const rackRows = [-10.0, -4.5, 4.5, 10.0];
    const shelfZ = [1.2, 2.5, 3.8, 5.1];

    rackRows.forEach((rackY) => {
      const yFront = rackY - 0.55;
      const yBack = rackY + 0.55;

      for (let ux = -19.6; ux <= 20.0; ux += 2.8) {
        [yFront, yBack].forEach((uy) => {
          for (let p = 0; p < 45; p++) {
            positions.push(
              ux + (Math.random() - 0.5) * 0.08,
              uy + (Math.random() - 0.5) * 0.08,
              Math.random() * 5.5
            );
            intensities.push(0.85);
          }
        });

        shelfZ.forEach((sz) => {
          if (Math.random() < 0.88) {
            for (let b = 0; b < 35; b++) {
              positions.push(
                ux + 1.2 + (Math.random() - 0.5) * 0.8,
                yFront + Math.random() * 0.9,
                sz + Math.random() * 0.9
              );
              intensities.push(0.45 + Math.random() * 0.25);
            }
          }
        });
      }

      shelfZ.forEach((sz) => {
        [yFront, yBack].forEach((uy) => {
          for (let c = 0; c < 260; c++) {
            positions.push(
              (Math.random() - 0.5) * 40.0,
              uy + (Math.random() - 0.5) * 0.04,
              sz + (Math.random() - 0.5) * 0.04
            );
            intensities.push(0.78);
          }
        });
      });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('intensity', new THREE.Float32BufferAttribute(intensities, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return {
      geometry: geometry,
      pointCount: positions.length / 3,
      isBinary: false
    };
  }

  return {
    load: function (url, onLoad, onError, stride) {
      // 1. Direct Embedded Buffer for file:/// protocol (100% immune to CORS errors!)
      if (typeof window !== 'undefined' && window.__REAL_PCD_BASE64__) {
        try {
          console.info('Parsing embedded real 3D LiDAR SLAM binary dataset...');
          const buffer = base64ToArrayBuffer(window.__REAL_PCD_BASE64__);
          const result = parseArrayBuffer(buffer, stride || 1);
          if (onLoad) onLoad(result);
          return;
        } catch (e) {
          console.warn('Error decoding embedded PCD:', e);
        }
      }

      // 2. Standard Network Fetch (when running on HTTP server or GitHub Pages)
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error('HTTP error loading PCD: ' + response.statusText);
          return response.arrayBuffer();
        })
        .then((buffer) => {
          const result = parseArrayBuffer(buffer, stride || 1);
          if (onLoad) onLoad(result);
        })
        .catch((err) => {
          console.warn('PCD fetch notice (using procedural fallback):', err);
          const fallback = generateWarehousePoints();
          if (onLoad) onLoad(fallback);
          if (onError) onError(err);
        });
    },
    parse: parseArrayBuffer,
    generateFallback: generateWarehousePoints
  };
});
