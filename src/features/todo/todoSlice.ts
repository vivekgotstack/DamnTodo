import { createSlice, nanoid } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

interface TodoState {
    id: string;
    msg: string;
    mode: "save" | "edit";
}
export type Todo = TodoState[];

const initialState: Todo = [];

export const todoSlice = createSlice({
    name: 'todo',
    initialState,
    reducers: {
        setTodo: (_, action: PayloadAction<Todo>) => {
            return action.payload;
        },
        removeTodo: (state, action: PayloadAction<string>) => {
            const index = state.findIndex((todo) => todo.id === action.payload);
            if (index !== -1) state.splice(index, 1);
        },
        addTodo: (state, action: PayloadAction<string>) => {
            state.push({ id: nanoid(), msg: action.payload, mode: 'save' });
        },
        toggleMode: (state, action: PayloadAction<string>) => {
            const todo = state.find(todo => todo.id === action.payload);
            if (todo) {
                todo.mode = todo.mode === "save" ? "edit" : "save";
            }
        },
        updateTodo: (state, action: PayloadAction<{ id: string, msg: string }>) => {
            const todo = state.find(todo => todo.id === action.payload.id);
            if (todo) {
                todo.msg = action.payload.msg;
            }
        },
        clearAllTodos: (state) => {
            state.length = 0;
        }
    },
})
export const { removeTodo, addTodo, toggleMode, updateTodo, clearAllTodos, setTodo } = todoSlice.actions

export default todoSlice.reducer