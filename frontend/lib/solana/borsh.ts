/**
 * A minimal little-endian byte reader/writer — just enough to decode the
 * `Market`/`Position` accounts and encode the `stake` instruction args, matching
 * Anchor/Borsh exactly. No dependency on a Borsh schema lib: the layouts are
 * frozen and mirrored as data (the same pattern the backend client uses).
 */
export class ByteReader {
  private view: DataView;
  constructor(
    private bytes: Uint8Array,
    private offset = 0,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  skip(n: number): this {
    this.offset += n;
    return this;
  }

  u8(): number {
    return this.view.getUint8(this.offset++);
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  u64(): bigint {
    const v = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }

  i64(): bigint {
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }

  fixed(n: number): Uint8Array {
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }
}

export class ByteWriter {
  private parts: number[] = [];

  u8(v: number): this {
    this.parts.push(v & 0xff);
    return this;
  }

  u32(v: number): this {
    for (let i = 0; i < 4; i++) this.parts.push((v >>> (i * 8)) & 0xff);
    return this;
  }

  i32(v: number): this {
    return this.u32(v >>> 0);
  }

  u64(v: bigint): this {
    let x = BigInt(v);
    for (let i = 0; i < 8; i++) {
      this.parts.push(Number(x & 0xffn));
      x >>= 8n;
    }
    return this;
  }

  i64(v: bigint): this {
    return this.u64(BigInt.asUintN(64, BigInt(v)));
  }

  bytes(b: Uint8Array | number[]): this {
    for (const x of b) this.parts.push(x & 0xff);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}
