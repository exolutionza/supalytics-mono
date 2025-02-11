// serializers.js

// Core serializer types
export const SerializerTypes = {
    RAW: 'raw',      // No processing, just toString()
    ARRAY: 'array',  // Wraps arrays in parentheses
    STRING: 'string' // Wraps in quotes
  };
  
  // Helper to find value by index in nested structures
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
  
  // Core serializer function
  function serialize(value, type = SerializerTypes.RAW) {
    // Handle null/undefined
    if (value == null) return '';
    
    // Handle empty arrays
    if (Array.isArray(value) && value.length === 0) return '';
    
    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length === 1) {
        return serialize(value[0], type);
      }
      
      const serializedItems = value.map(item => serialize(item, type));
      
      if (type === SerializerTypes.RAW) {
        return serializedItems.join(',');
      }
      return `(${serializedItems.join(',')})`;
    }
    
    // Handle SQL subqueries specially
    if (typeof value === 'string' && value.trim().toUpperCase().startsWith('SELECT')) {
      if (type === SerializerTypes.RAW) {
        return value;
      }
      return `(${value})`;
    }
    
    // Convert to string
    const str = String(value).trim();
    if (!str) return '';
    
    // Apply type-specific wrapping
    switch (type) {
      case SerializerTypes.STRING:
        return `'${str}'`;
      case SerializerTypes.ARRAY:
      case SerializerTypes.RAW:
      default:
        return str;
    }
  }
  
  // Main export function
  export function serializeOutputData(outputData, template) {
    try {
      if (!outputData) return '';

      let value = outputData
      if (template?.index) {
        value = template.index != null
        ? findValueByIndex(outputData, template.index)
        : outputData;
      }      

      return serialize(value, template?.type || SerializerTypes.RAW);
    } catch (error) {
      console.error('Serialization error:', error);
      return '';
    }
  }

  export function serializeWidgetParams(widgetId, state) {
    const rawParams = {};
    const widgetTemplates = state.templates?.byWidget?.[widgetId] ?? [];
    const { globalOutputs } = state;
  
    widgetTemplates.forEach((template) => {
      const paramName = template.variable_key || template.variable_id;
      let value = globalOutputs[template.variable_id];
  
      if (template.index != null) {
        value = findValueByIndex(value, template.index);
      }
  
      rawParams[paramName] = serialize(value, template.type || SerializerTypes.RAW);
    });
  
    return rawParams;
  }