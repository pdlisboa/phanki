/** Tiny protobuf reader, just enough for the few Anki messages we need. */
export interface ProtoField {
  field: number
  wire: number
  int?: number
  bytes?: Uint8Array
}

export function readProto(buf: Uint8Array): ProtoField[] {
  const out: ProtoField[] = []
  let pos = 0
  const varint = () => {
    let result = 0
    let shift = 0
    while (pos < buf.length) {
      const b = buf[pos++]
      result += (b & 0x7f) * 2 ** shift
      if (!(b & 0x80)) break
      shift += 7
    }
    return result
  }
  while (pos < buf.length) {
    const key = varint()
    const field = Math.floor(key / 8)
    const wire = key & 7
    if (wire === 0) out.push({ field, wire, int: varint() })
    else if (wire === 2) {
      const len = varint()
      out.push({ field, wire, bytes: buf.subarray(pos, pos + len) })
      pos += len
    } else if (wire === 1) pos += 8
    else if (wire === 5) pos += 4
    else break
  }
  return out
}

const decoder = new TextDecoder()

export function protoString(fields: ProtoField[], n: number): string | undefined {
  const f = fields.find((x) => x.field === n && x.bytes)
  return f?.bytes ? decoder.decode(f.bytes) : undefined
}

export function protoInt(fields: ProtoField[], n: number): number | undefined {
  return fields.find((x) => x.field === n && x.int !== undefined)?.int
}
