import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import { supabase } from '@/services/supabase-client';

// Constants for positioning
const DEFAULT_WIDGET_WIDTH = 4;
const DEFAULT_WIDGET_HEIGHT = 4;
const TOP_MARGIN = 1;
const MAX_Y_POSITION = 12;
const GRID_WIDTH = 12;

// Helper functions remain the same
function checkOverlap(proposed, existingLocations) {
  return existingLocations.some(existing => (
    proposed.x < (existing.x + existing.width) &&
    (proposed.x + proposed.width) > existing.x &&
    proposed.y < (existing.y + existing.height) &&
    (proposed.y + proposed.height) > existing.y
  ));
}

function generateRandomPosition(widget, existingLocations) {
  const width = widget.width || DEFAULT_WIDGET_WIDTH;
  const height = widget.height || DEFAULT_WIDGET_HEIGHT;
  const maxX = Math.max(0, GRID_WIDTH - width);
  
  // Try random positions first
  for (let i = 0; i < 50; i++) {
    const x = Math.floor(Math.random() * maxX);
    const y = Math.floor(Math.random() * (MAX_Y_POSITION - TOP_MARGIN)) + TOP_MARGIN;
    
    const position = { x, y, width, height };
    if (!checkOverlap(position, existingLocations)) {
      return position;
    }
  }
  
  // If random positions fail, try systematic placement
  for (let y = TOP_MARGIN; y < MAX_Y_POSITION; y++) {
    for (let x = 0; x <= maxX; x++) {
      const position = { x, y, width, height };
      if (!checkOverlap(position, existingLocations)) {
        return position;
      }
    }
  }
  
  // If all else fails, stack at the bottom
  const maxExistingY = existingLocations.length > 0
    ? Math.max(...existingLocations.map(loc => loc.y + loc.height))
    : TOP_MARGIN;
    
  return {
    x: 0,
    y: maxExistingY,
    width,
    height
  };
}

const widgetLocationsAdapter = createEntityAdapter({
  selectId: (location) => {
    // Add null check for location
    if (!location || !location.id) {
      throw new Error('Invalid widget location: missing id');
    }
    return location.id;
  },
  sortComparer: (a, b) => {
    if (a?.created_at && b?.created_at) {
      return new Date(a.created_at) - new Date(b.created_at);
    }
    return 0;
  }
});

const widgetLocationsInitialState = widgetLocationsAdapter.getInitialState({
  loading: false,
  error: null
});

export const fetchWidgetLocations = createAsyncThunk(
  'widgetLocations/fetchWidgetLocations',
  async ({ dashboardId, screenSize }) => {
    try {
      // Get all widgets for the dashboard
      const { data: widgets, error: widgetsError } = await supabase
        .from('widgets')
        .select('*')
        .eq('dashboard_id', dashboardId);

      if (widgetsError) throw new Error(widgetsError.message);
      if (!widgets?.length) return [];

      // Get existing locations
      let query = supabase
        .from('widget_locations')
        .select('*')
        .in('widget_id', widgets.map(w => w.id));

      if (screenSize) {
        query = query.eq('screen_size', screenSize);
      }

      const { data: existingLocations, error } = await query;
      if (error) throw new Error(error.message);

      const locationsMap = new Map(existingLocations?.map(loc => [loc.widget_id, loc]) || []);
      const results = [...(existingLocations || [])];

      // Process widgets sequentially to ensure no overlap
      for (const widget of widgets) {
        if (!locationsMap.has(widget.id)) {
          const position = generateRandomPosition(widget, results);
          const newLocation = {
            widget_id: widget.id,
            screen_size: screenSize || 'default',
            ...position,
            config: widget.config || {}
          };

          const { data, error: insertError } = await supabase
            .from('widget_locations')
            .insert(newLocation)
            .single();

          if (insertError) {
            console.error(`Failed to insert location for widget ${widget.id}:`, insertError);
            continue;
          }

          if (data) {
            results.push(data);
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error in fetchWidgetLocations:', error);
      throw error;
    }
  }
);

export const upsertWidgetLocation = createAsyncThunk(
  'widgetLocations/upsertWidgetLocation',
  async (location) => {
    const { data, error } = await supabase
      .from('widget_locations')
      .upsert(location)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
);

const widgetLocationsSlice = createSlice({
  name: 'widgetLocations',
  initialState: widgetLocationsInitialState,
  reducers: {
    randomizeWidgetPositions: (state, action) => {
      const widgetIds = action.payload;
      const existingLocations = Object.values(state.entities);
      
      widgetIds.forEach(widgetId => {
        const widget = { id: widgetId };
        const position = generateRandomPosition(widget, existingLocations);
        
        widgetLocationsAdapter.upsertOne(state, {
          widget_id: widgetId,
          screen_size: 'default',
          ...position
        });
      });
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWidgetLocations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWidgetLocations.fulfilled, (state, action) => {
        state.loading = false;
        // Only set locations if we have valid data
        if (Array.isArray(action.payload)) {
          widgetLocationsAdapter.setAll(state, action.payload);
        }
      })
      .addCase(fetchWidgetLocations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message;
      })
      .addCase(upsertWidgetLocation.fulfilled, (state, action) => {
        if (action.payload) {
          widgetLocationsAdapter.upsertOne(state, action.payload);
        }
      })
      .addCase(upsertWidgetLocation.rejected, (state, action) => {
        state.error = action.error?.message;
      });
  },
});

export const { randomizeWidgetPositions } = widgetLocationsSlice.actions;
export const widgetLocationsReducer = widgetLocationsSlice.reducer;

export const {
  selectAll: selectAllWidgetLocations,
  selectById: selectWidgetLocationById,
  selectEntities: selectWidgetLocationEntities,
} = widgetLocationsAdapter.getSelectors((state) => state.widgetLocations);