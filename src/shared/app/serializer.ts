/* eslint-disable @typescript-eslint/no-explicit-any */
import { SuperJSON } from 'superjson';
import { SuperJSONResult } from 'superjson/dist/types';

/**
 * Uses SuperJson to serialize data without losing dates.
 * I.e, when doing "io.emit('event', new Date())",
 * I get a string on the other side.
 *
 * These normalize and denormalize allow sending object
 * or array of objects containing special types (Date, ...)
 *
 * Also, superjson alter the json at the root with {json:..., meta:...},
 * which is not wanted, because too agressive for socket.io (breaks socket.io admin UI).
 * So I alter superjson format to just add a single "__meta" key,
 * and keep it more compatible and less obstrusive with:
 *
 *  {
 *       ...mydata,
 *       __meta: { ...superjson things... },
 *  }
 *
 * These functions are only normalization.
 * Normalized object can then encoded as json safely.
 */

/**
 * Tranform an object or an array of object to a superjson.
 * Example:
 *      { date: new Date() } => { date: '2020...Z', __meta: { ... } }
 * or:
 *      ['string', { mydata }] => ['string', { mydata, __meta: {...} }]
 *
 * Does noting with other type of data,
 * nor does not convert Date if not in an object.
 *
 * Object output can be safely JSON.stringify().
 *
 * "root" argument should not be used outside. Used only to handle array at first level only.
 */
export const normalize = (data: any, root = true): any => {
    if (Array.isArray(data)) {
        if (root) {
            return data.map(item => normalize(item, false));
        }

        return data;
    }

    if (!data || 'Object' !== data.constructor.name) {
        return data;
    }

    const { json, meta } = SuperJSON.serialize(data);

    if (!json || 'Object' !== json.constructor.name) {
        throw new Error(`Expected an object here, got ${json}`);
    }

    if (meta) {
        (json as any).__meta = meta;
    }

    return json;
};

/**
 * Convert an object back with original special types (Date, ...).
 * Example:
 *      { date: '2020...Z', __meta: { ... } } => { date: Date(...) }
 * or:
 *      ['string', { mydata, __meta: {...} }] => ['string', { mydata }]
 */
export const denormalize = (data: any, root = true): any => {
    try {
        if (Array.isArray(data)) {
            if (root) {
                return data.map(item => denormalize(item, false));
            }

            return data;
        }

        if (!data?.__meta) {
            return data;
        }

        const superJson: SuperJSONResult = {
            json: data,
            meta: data.__meta,
        };

        delete (superJson.json as any)['__meta'];

        return SuperJSON.deserialize(superJson);
    } catch (e) {
        // In case of error here, socket.io silently fails and packets are lost.
        // Prevent this by doing nothing and not trying to transform data.
        console.error(e);
        return data;
    }
};
