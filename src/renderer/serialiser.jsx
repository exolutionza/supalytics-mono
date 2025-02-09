//SERIALIZER MOVE TO EXECUTE ONE!!!!!!







import _ from "lodash";

// Define template types based on the database schema
export const TemplateTypes = {
    TEXT: "text",
    NUMBER: "number",
    DATE: "date",
    BOOLEAN: "boolean",
    SQL: "sql",
    RAW: "raw",
    AUTO: "auto"
};

export const SerializerTypes = {
    AUTO: "auto",
    RAW: "raw",
    SQL: "sql",
    DATE: "date"
};

// Deep search for an index in an object or array
const findValueByIndex = (obj, index) => {
    if (!obj) return undefined;
    
    // If array, directly access by index
    if (Array.isArray(obj)) {
        return obj[index];
    }
    
    // If object, search recursively
    if (typeof obj === 'object') {
        // First try to find an array in the object and use the index
        const arrays = Object.values(obj).filter(Array.isArray);
        if (arrays.length > 0) {
            return arrays[0][index];
        }
        
        // If no arrays found, search recursively through all object values
        return Object.values(obj).reduce((result, value) => 
            result !== undefined ? result : 
            typeof value === 'object' ? findValueByIndex(value, index) : 
            undefined, undefined);
    }
    
    return undefined;
};

// Determine serializer type based on template type
const getSerializerType = (templateType) => {
    switch (templateType.toLowerCase()) {
        case TemplateTypes.RAW:
            return SerializerTypes.RAW;
        case TemplateTypes.DATE:
            return SerializerTypes.DATE;
        case TemplateTypes.SQL:
            return SerializerTypes.SQL;
        default:
            return SerializerTypes.AUTO;
    }
};

// Smart serializer that handles all cases
const smartSerialize = (value, templateType = TemplateTypes.AUTO) => {
    // Handle null/undefined
    if (value == null) return '';
    
    const type = getSerializerType(templateType);
    
    // Handle Date objects and strings
    if (type === SerializerTypes.DATE || value instanceof Date || 
        (typeof value === 'string' && !isNaN(Date.parse(value)))) {
        const date = new Date(value);
        return `'${date.toISOString().slice(0, 10)}'`;
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
        if (value.length === 0) return '';
        if (value.length === 1) return smartSerialize(value[0], templateType);
        
        const serializedArray = value.map(item => smartSerialize(item, templateType));
        return type === SerializerTypes.RAW ? 
            serializedArray.join(',') :
            `(${serializedArray.join(',')})`;
    }
    
    // Handle SQL queries
    if (typeof value === 'string' && 
        value.trim().toUpperCase().startsWith('SELECT')) {
        return type === SerializerTypes.RAW ? value : `(${value})`;
    }
    
    // Handle boolean values
    if (typeof value === 'boolean') {
        return value.toString();
    }
    
    // Handle number values
    if (typeof value === 'number') {
        return value.toString();
    }
    
    // Handle regular string values
    const stringValue = String(value).trim();
    if (!stringValue) return '';
    
    return type === SerializerTypes.RAW ? 
        stringValue : 
        `'${stringValue}'`;
};

export const serializeOutputData = (outputData, template) => {
    try {
        // Early return if no data
        if (!outputData) return '';
        
        // Get value using template index
        const value = findValueByIndex(outputData, template.index);
            
        // Use template type for serialization
        return smartSerialize(value, template.type);
    } catch (error) {
        console.error('Serialization error:', error);
        return '';
    }
};