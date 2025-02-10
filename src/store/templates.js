// templates.js

import _ from 'lodash';

// Template and serializer types
export const TemplateTypes = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
  SQL: 'sql',
  RAW: 'raw',
  AUTO: 'auto'
};

export const SerializerTypes = {
  AUTO: 'auto',
  RAW: 'raw',
  SQL: 'sql',
  DATE: 'date'
};

// If you keep a dependency map from globalOutputKey -> [widgetIds]
export const dependencyMap = {}; // e.g. { 'selectedDateRange': ['widgetA','widgetB'], ... }

/** 
 * Optionally, a function to rebuild this map from the DB or from
 * "widget_templates" data (pseudo-code).
 */
export function buildDependencyMap(widgetTemplatesByWidget) {
  const map = {};

  // widgetTemplatesByWidget: { [widgetId]: [ { variable_id, variable_key, ...}, ... ] }
  Object.entries(widgetTemplatesByWidget).forEach(([widgetId, templates]) => {
    templates.forEach((tpl) => {
      const key = tpl.variable_id;
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(widgetId);
    });
  });

  return map;
}

/* ===========================================================================
   Helper: findValueByIndex (to pick an item from arrays)
   =========================================================================== */
function findValueByIndex(obj, index) {
  if (!obj) return undefined;
  if (Array.isArray(obj)) {
    return obj[index];
  }
  if (typeof obj === 'object') {
    const arrays = Object.values(obj).filter(Array.isArray);
    if (arrays.length > 0) {
      return arrays[0][index];
    }
    return Object.values(obj).reduce((result, value) => {
      if (result !== undefined) return result;
      if (typeof value === 'object') {
        return findValueByIndex(value, index);
      }
      return undefined;
    }, undefined);
  }
  return undefined;
}

/* ===========================================================================
   Helper: getSerializerType
   =========================================================================== */
function getSerializerType(templateType) {
  switch ((templateType || '').toLowerCase()) {
    case TemplateTypes.RAW:
      return SerializerTypes.RAW;
    case TemplateTypes.DATE:
      return SerializerTypes.DATE;
    case TemplateTypes.SQL:
      return SerializerTypes.SQL;
    default:
      return SerializerTypes.AUTO;
  }
}

/* ===========================================================================
   Core Serializer
   =========================================================================== */
function smartSerialize(value, templateType = TemplateTypes.AUTO) {
  if (value == null) return '';

  const type = getSerializerType(templateType);

  // Date logic
  const isDateLike =
    type === SerializerTypes.DATE ||
    value instanceof Date ||
    (typeof value === 'string' && !isNaN(Date.parse(value)));

  if (isDateLike) {
    const date = new Date(value);
    return `'${date.toISOString().slice(0, 10)}'`;
  }

  // Array logic
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (value.length === 1) {
      return smartSerialize(value[0], templateType);
    }
    const serializedArray = value.map((item) => smartSerialize(item, templateType));
    return type === SerializerTypes.RAW
      ? serializedArray.join(',')
      : `(${serializedArray.join(',')})`;
  }

  // SQL subquery
  if (typeof value === 'string' && value.trim().toUpperCase().startsWith('SELECT')) {
    return type === SerializerTypes.RAW ? value : `(${value})`;
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value.toString();
  }

  // Number
  if (typeof value === 'number') {
    return value.toString();
  }

  // Default string
  const str = String(value).trim();
  if (!str) return '';
  return type === SerializerTypes.RAW ? str : `'${str}'`;
}

/* ===========================================================================
   Public function: serializeOutputData
   =========================================================================== */
export function serializeOutputData(outputData, template) {
  try {
    if (!outputData) return '';
    const value =
      template.index != null
        ? findValueByIndex(outputData, template.index)
        : outputData;
    return smartSerialize(value, template.type);
  } catch (error) {
    console.error('Serialization error:', error);
    return '';
  }
}
