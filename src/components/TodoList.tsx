import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@radix-ui/react-alert-dialog";
import { AlertDialogHeader, AlertDialogFooter } from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { useDispatch, useSelector } from "react-redux";
import {
  removeTodo,
  addTodo,
  toggleMode,
  updateTodo,
  setTodo,
  clearAllTodos,
  type Todo,
} from "@/features/todo/todoSlice";
import { useEffect, useState } from "react";
import type { RootState } from "@/store";

function TodoList() {
  const dispatch = useDispatch();
  const todos = useSelector((state: RootState) => state.todo);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const storedTodo = localStorage.getItem("todos");
    if (storedTodo)
      try {
        const parsed: Todo = JSON.parse(storedTodo);
        parsed.forEach((t) => {
          if (t.mode === "edit") {
            t.mode = "save";
          }
        });
        dispatch(setTodo(parsed));
      } catch (err) {
        console.error("Failed to parse stored todos:", err);
      }
    setLoaded(true);
  }, [dispatch]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("todos", JSON.stringify(todos));
  }, [todos, loaded]);

  return (
    <div className="bg-amber-100 w-full min-h-screen flex py-10 flex-col justify-center items-center">
      <div className="h-1/3 w-2/3 shadow-amber-400 shadow-lg rounded-lg flex flex-col items-center mb-8">
        <h1 className=" text-4xl lg:text-6xl md:text-6xl sm:text-4xl font-bold text-amber-400 mb-5 p-2">
          TodoList
        </h1>
        <div className="flex flex-col w-full gap-5 items-center mb-2">
          <input
            type="text"
            className="p-2 w-2/3 rounded-lg border border-amber-400 text-amber-700"
            placeholder="Add todo here"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
          <Button
            className="bg-amber-400 text-amber-100 hover:bg-amber-500 cursor-pointer"
            onClick={() => {
              if (!msg.trim()) return;
              dispatch(addTodo(msg));
              setMsg("");
            }}
          >
            Add
          </Button>
          <AlertDialog>
            <AlertDialogTrigger className="bg-amber-400 text-amber-100 hover:bg-amber-500 cursor-pointer p-2 rounded-lg">
              Remove All
            </AlertDialogTrigger>
            <AlertDialogContent className="fixed inset-0 bg-amber-100/30 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-amber-100 p-6 border-4 border-amber-400 rounded-lg shadow-lg w-96">
                <AlertDialogHeader className="text-amber-500">
                  <AlertDialogTitle className="font-bold">
                    Are you absolutely sure?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    all the todos saved in your local storage.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex justify-end gap-2 mt-4">
                  <AlertDialogCancel className="bg-amber-400 text-amber-100 hover:bg-amber-500 p-2 rounded-lg">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-amber-400 text-amber-100 hover:bg-amber-500 p-2 rounded-lg"
                    onClick={() => dispatch(clearAllTodos())}
                  >
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {todos.map((todo) => (
        <div
          key={todo.id}
          className="mt-4 border-4 border-amber-400 hover:-translate-y-0.5 w-11/12 text-amber-700 p-2 rounded-lg flex justify-between"
        >
          {todo.mode === "edit" ? (
            <div className="w-full h-10">
              <input
                type="text"
                value={todo.msg}
                className="border border-amber-300 min-h-full w-full flex"
                onChange={(e) =>
                  dispatch(updateTodo({ id: todo.id, msg: e.target.value }))
                }
              />
            </div>
          ) : (
            <div className="break-all translate-y-1.5">{todo.msg}</div>
          )}
          <div className="flex gap-2 items-baseline-last">
            {todo.mode === "save" ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="36"
                viewBox="0 0 22 25"
                className="fill-current cursor-pointer edit-svg"
                onClick={() => dispatch(toggleMode(todo.id))}
              >
                <path d="m18.988 2.012l3 3L19.701 7.3l-3-3zM8 16h3l7.287-7.287l-3-3L8 13z" />
                <path d="M19 19H8.158c-.026 0-.053.01-.079.01c-.033 0-.066-.009-.1-.01H5V5h6.847l2-2H5c-1.103 0-2 .896-2 2v14c0 1.104.897 2 2 2h14a2 2 0 0 0 2-2v-8.668l-2 2z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="38"
                height="38"
                viewBox="0 0 32 32"
                className="fill-current cursor-pointer save-svg"
                onClick={() => dispatch(toggleMode(todo.id))}
              >
                <path d="m27.71 9.29l-5-5A1 1 0 0 0 22 4H6a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V10a1 1 0 0 0-.29-.71M12 6h8v4h-8Zm8 20h-8v-8h8Zm2 0v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8H6V6h4v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.41l4 4V26Z" />
              </svg>
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="34"
              height="34"
              viewBox="0 0 26 28"
              className="fill-current cursor-pointer delete-svg"
              onClick={() => dispatch(removeTodo(todo.id))}
            >
              <path d="M11.5-.031c-1.958 0-3.531 1.627-3.531 3.594V4H4c-.551 0-1 .449-1 1v1H2v2h2v15c0 1.645 1.355 3 3 3h12c1.645 0 3-1.355 3-3V8h2V6h-1V5c0-.551-.449-1-1-1h-3.969v-.438c0-1.966-1.573-3.593-3.531-3.593zm0 2.062h3c.804 0 1.469.656 1.469 1.531V4H10.03v-.438c0-.875.665-1.53 1.469-1.53zM6 8h5.125c.124.013.247.031.375.031h3c.128 0 .25-.018.375-.031H20v15c0 .563-.437 1-1 1H7c-.563 0-1-.437-1-1zm2 2v12h2V10zm4 0v12h2V10zm4 0v12h2V10z" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}
export default TodoList;
