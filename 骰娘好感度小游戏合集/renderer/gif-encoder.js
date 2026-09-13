'use strict';

/**
 * GIF89a 动态图编码器（纯 JavaScript 零原生编译依赖）
 *
 * 特性：
 * 1. 支持逐帧独立设置延迟（1/100 秒为单位），特别支持尾帧 30000cs（300秒）超长冻结定格。
 * 2. 具备中值切割（Median-Cut）调色板生成与局部颜色表（Local Color Table）支持，精准保真各帧色彩。
 * 3. 规范的 Netscape 2.0 循环扩展与标准 LZW 压缩编码，兼容所有主流客户端与 QQ 图片查看器。
 */
class GifEncoder {
  constructor(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.frames = [];
    this.loopCount = 0; // 0 = 循环播放
  }

  setRepeat(loop = 0) {
    this.loopCount = loop;
  }

  /**
   * 添加一帧
   * @param {CanvasRenderingContext2D|{data: Uint8ClampedArray, width: number, height: number}} ctxOrImageData
   * @param {number} delayCentiseconds 帧延迟，单位 1/100 秒（例如 10 为 100ms，30000 为 300 秒）
   */
  addFrame(ctxOrImageData, delayCentiseconds = 10) {
    let imgData;
    if (ctxOrImageData && ctxOrImageData.data && ctxOrImageData.width && ctxOrImageData.height) {
      imgData = ctxOrImageData;
    } else if (ctxOrImageData && typeof ctxOrImageData.getImageData === 'function') {
      imgData = ctxOrImageData.getImageData(0, 0, this.width, this.height);
    } else {
      throw new Error('GifEncoder.addFrame requires a 2D canvas context or an ImageData object.');
    }
    this.frames.push({
      data: imgData.data,
      delay: Math.max(1, Math.min(65535, Math.floor(delayCentiseconds)))
    });
  }

  finish() {
    if (!this.frames.length) {
      throw new Error('GifEncoder: No frames added before calling finish().');
    }

    const chunks = [];
    // 1. GIF89a 头部
    chunks.push(Buffer.from('GIF89a', 'ascii'));

    // 2. 逻辑屏幕描述块 (Logical Screen Descriptor)
    const lsd = Buffer.alloc(7);
    lsd.writeUInt16LE(this.width, 0);
    lsd.writeUInt16LE(this.height, 2);
    lsd[4] = 0x70; // 0b01110000: 无全局颜色表，色彩分辨率 8 位
    lsd[5] = 0;    // 背景色索引
    lsd[6] = 0;    // 像素纵横比
    chunks.push(lsd);

    // 3. Netscape 2.0 应用程序循环块 (Application Extension)
    if (this.loopCount >= 0) {
      const netscape = Buffer.alloc(19);
      netscape[0] = 0x21; // 扩展引导符
      netscape[1] = 0xff; // 应用扩展标签
      netscape[2] = 0x0b; // 块大小 11
      netscape.write('NETSCAPE2.0', 3, 11, 'ascii');
      netscape[14] = 0x03; // 子块大小 3
      netscape[15] = 0x01; // 子块ID
      netscape.writeUInt16LE(this.loopCount, 16);
      netscape[18] = 0x00; // 块终止符
      chunks.push(netscape);
    }

    // 4. 逐帧编码
    for (const frame of this.frames) {
      const { palette, indexedPixels } = this.quantize(frame.data);

      // 图形控制扩展 (GCE: Graphic Control Extension)
      const gce = Buffer.alloc(8);
      gce[0] = 0x21; // 扩展引导符
      gce[1] = 0xf9; // GCE 标识
      gce[2] = 0x04; // 块大小 4
      gce[3] = 0x08; // 处置方式: 2 (Restore to background), 不使用透明色
      gce.writeUInt16LE(frame.delay, 4); // 帧延迟（16位整数，最大可达 655.35 秒）
      gce[6] = 0x00; // 透明色索引
      gce[7] = 0x00; // 块终止符
      chunks.push(gce);

      // 图像描述块 (Image Descriptor)
      const id = Buffer.alloc(10);
      id[0] = 0x2c; // 图像标识符
      id.writeUInt16LE(0, 1); // 偏移 X
      id.writeUInt16LE(0, 3); // 偏移 Y
      id.writeUInt16LE(this.width, 5); // 宽度
      id.writeUInt16LE(this.height, 7); // 高度
      id[9] = 0x87; // 0b10000111: 启用局部调色板，大小 256 色 (2^(7+1))
      chunks.push(id);

      // 局部调色板数据 (256 * 3 字节)
      chunks.push(palette);

      // LZW 压缩像素流
      const lzwData = this.lzwCompress(indexedPixels, 8);
      chunks.push(lzwData);
    }

    // 5. 文件结束符 (Trailer)
    chunks.push(Buffer.from([0x3b]));

    return Buffer.concat(chunks);
  }

  /**
   * 中值切割（Median-Cut）快速颜色量化
   */
  quantize(rgba) {
    const totalPixels = rgba.length >> 2;
    const sampledColors = [];
    const step = Math.max(1, Math.floor(totalPixels / 15000));
    for (let i = 0; i < rgba.length; i += 4 * step) {
      sampledColors.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
    }

    function findBoxes(colors, maxBoxes) {
      let boxes = [{
        colors,
        rMin: 0, rMax: 255,
        gMin: 0, gMax: 255,
        bMin: 0, bMax: 255
      }];
      function updateBounds(box) {
        let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
        for (const c of box.colors) {
          if (c[0] < r0) r0 = c[0]; if (c[0] > r1) r1 = c[0];
          if (c[1] < g0) g0 = c[1]; if (c[1] > g1) g1 = c[1];
          if (c[2] < b0) b0 = c[2]; if (c[2] > b1) b1 = c[2];
        }
        box.rMin = r0; box.rMax = r1;
        box.gMin = g0; box.gMax = g1;
        box.bMin = b0; box.bMax = b1;
        box.rRange = r1 - r0;
        box.gRange = g1 - g0;
        box.bRange = b1 - b0;
        box.maxRange = Math.max(box.rRange, box.gRange, box.bRange);
      }
      updateBounds(boxes[0]);

      while (boxes.length < maxBoxes) {
        let maxBoxIdx = -1;
        let maxRange = -1;
        for (let i = 0; i < boxes.length; i++) {
          if (boxes[i].colors.length >= 2 && boxes[i].maxRange > maxRange) {
            maxRange = boxes[i].maxRange;
            maxBoxIdx = i;
          }
        }
        if (maxBoxIdx === -1 || maxRange <= 0) break;
        const box = boxes.splice(maxBoxIdx, 1)[0];
        let axis = 0;
        if (box.gRange >= box.rRange && box.gRange >= box.bRange) axis = 1;
        else if (box.bRange >= box.rRange && box.bRange >= box.gRange) axis = 2;

        box.colors.sort((a, b) => a[axis] - b[axis]);
        const mid = box.colors.length >> 1;
        const b1 = { colors: box.colors.slice(0, mid) };
        const b2 = { colors: box.colors.slice(mid) };
        updateBounds(b1);
        updateBounds(b2);
        boxes.push(b1, b2);
      }
      return boxes;
    }

    const boxes = findBoxes(sampledColors, 256);
    const palette = Buffer.alloc(256 * 3, 0);
    const paletteRgb = [];

    for (let i = 0; i < boxes.length; i++) {
      let sumR = 0, sumG = 0, sumB = 0;
      const cnt = boxes[i].colors.length;
      if (cnt > 0) {
        for (const c of boxes[i].colors) {
          sumR += c[0]; sumG += c[1]; sumB += c[2];
        }
        palette[i * 3] = Math.round(sumR / cnt);
        palette[i * 3 + 1] = Math.round(sumG / cnt);
        palette[i * 3 + 2] = Math.round(sumB / cnt);
      }
      paletteRgb.push([palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]]);
    }

    // 32x32x32 快速色彩查找表
    const lut = new Uint8Array(32768);
    const lutComputed = new Uint8Array(32768);

    function findClosest(r, g, b) {
      const idx = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if (lutComputed[idx]) return lut[idx];
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let i = 0; i < paletteRgb.length; i++) {
        const pr = paletteRgb[i][0];
        const pg = paletteRgb[i][1];
        const pb = paletteRgb[i][2];
        const dr = r - pr;
        const dg = g - pg;
        const db = b - pb;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
          if (dist === 0) break;
        }
      }
      lut[idx] = bestIdx;
      lutComputed[idx] = 1;
      return bestIdx;
    }

    const indexedPixels = new Uint8Array(totalPixels);
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      indexedPixels[p] = findClosest(rgba[i], rgba[i + 1], rgba[i + 2]);
    }

    return { palette, indexedPixels };
  }

  /**
   * LZW 图像数据压缩
   */
  lzwCompress(pixels, minCodeSize) {
    const clearCode = 1 << minCodeSize; // 256
    const eoiCode = clearCode + 1;      // 257
    let curCodeSize = minCodeSize + 1;  // 9
    let nextCode = clearCode + 2;       // 258
    const maxTableSize = 4096;

    const outBytes = [];
    outBytes.push(minCodeSize); // 初始代码大小

    let curAccum = 0;
    let curBits = 0;
    const packet = [];

    function writeCode(code) {
      curAccum |= (code << curBits);
      curBits += curCodeSize;
      while (curBits >= 8) {
        packet.push(curAccum & 0xff);
        curAccum >>= 8;
        curBits -= 8;
        if (packet.length === 254) {
          outBytes.push(packet.length, ...packet);
          packet.length = 0;
        }
      }
    }

    function flush() {
      if (curBits > 0) {
        packet.push(curAccum & 0xff);
        curAccum = 0;
        curBits = 0;
      }
      if (packet.length > 0) {
        outBytes.push(packet.length, ...packet);
        packet.length = 0;
      }
      outBytes.push(0x00); // 块终止符
    }

    writeCode(clearCode);

    let codeTable = new Map();
    let prefix = pixels[0];

    for (let i = 1; i < pixels.length; i++) {
      const k = pixels[i];
      const key = (prefix << 8) | k;
      const code = codeTable.get(key);

      if (code !== undefined) {
        prefix = code;
      } else {
        writeCode(prefix);
        if (nextCode < maxTableSize) {
          codeTable.set(key, nextCode++);
          if (nextCode > (1 << curCodeSize) && curCodeSize < 12) {
            curCodeSize++;
          }
        } else {
          writeCode(clearCode);
          codeTable.clear();
          curCodeSize = minCodeSize + 1;
          nextCode = clearCode + 2;
        }
        prefix = k;
      }
    }

    writeCode(prefix);
    writeCode(eoiCode);
    flush();

    return Buffer.from(outBytes);
  }
}

/**
 * 便捷导出方法：将多帧 Canvas 渲染为 GIF Buffer
 * @param {Array<{canvas: Object, delay: number}>} frames
 * @param {number} width
 * @param {number} height
 * @param {number} repeat 循环次数，默认 0 为循环播放
 * @returns {Buffer}
 */
function encodeCanvasFrames(frames, width, height, repeat = 0) {
  if (!frames || !frames.length) throw new Error('encodeCanvasFrames: frames array must not be empty');
  const encoder = new GifEncoder(width, height);
  encoder.setRepeat(repeat);
  for (const item of frames) {
    const ctx = item.canvas ? item.canvas.getContext('2d') : item;
    const delay = item.delay !== undefined ? item.delay : 10;
    encoder.addFrame(ctx, delay);
  }
  return encoder.finish();
}

module.exports = {
  GifEncoder,
  encodeCanvasFrames
};
