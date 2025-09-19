import { Button } from "./ui/button";
import { Card, CardTitle } from "./ui/card";
import { useEffect, useState } from "react";

interface TodoProps {
  id: string;
  msg: string;
  mode: "edit" | "save";
}
function TodoList() {
  const [todos, setTodos] = useState<TodoProps[]>([]);

  useEffect(() => {
    let todos = localStorage.getItem("todos");
    if (todos) {
      setTodos(JSON.parse(todos));
    }
  }, []);

  useEffect(() => {
    if (todos.length === 0) {
      localStorage.removeItem("todos");
    } else {
      localStorage.setItem("todos", JSON.stringify(todos));
    }
  }, [todos]);

  const toggleMode = (id: string) => {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              mode: t.mode === "edit" ? "save" : "edit",
            }
          : t
      )
    );
  };
  const addTodoHandler = (todo: TodoProps) => {
    setTodos((prev) => [...prev, todo]);
  };
  const delTodoHandler = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };
  return (
    <div className="w-full min-h-screen bg-gray-800 flex flex-col justify-center items-center">
      <Card className="bg-gray-700 h-2/12 border-0 w-svw fixed top-0 p-5 flex flex-col justify-center items-center">
        <CardTitle className="text-center font-bold text-5xl text-transparent bg-clip-text bg-gradient-to-r from-gray-800 via-gray-900 to-black">
          TodoList
        </CardTitle>
        <Button
          onClick={() =>
            addTodoHandler({
              id: Date.now().toString(),
              msg: "",
              mode: "save",
            })
          }
        >
          Add Task
        </Button>
      </Card>
      <div className="mb-40"></div>
      {todos.map((todo) => (
        <div
          key={todo.id}
          className="w-3/4 bg-gray-700 border-0 hover:border-gray-600 hover:border p-2 rounded-lg flex justify-between mb-5"
        >
          {todo.mode === "save" ? (
            <input
              className="w-full text-2xl text-black border-gray-500"
              value={todo.msg}
              onChange={(e) => {
                setTodos((prev) =>
                  prev.map((t) =>
                    t.id === todo.id ? { ...t, msg: e.target.value } : t
                  )
                );
              }}
            ></input>
          ) : (
            <div className="text-2xl h-auto break-all overflow-hidden">
              {todo.msg}
            </div>
          )}
          <div className="flex gap-4">
            {todo.mode === "edit" ? (
              <button
                className="cursor-pointer hover:text-black"
                onClick={() => toggleMode(todo.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="38"
                  height="38"
                  viewBox="0 0 24 24"
                  className="fill-current"
                >
                  <path d="m18.988 2.012l3 3L19.701 7.3l-3-3zM8 16h3l7.287-7.287l-3-3L8 13z" />
                  <path d="M19 19H8.158c-.026 0-.053.01-.079.01c-.033 0-.066-.009-.1-.01H5V5h6.847l2-2H5c-1.103 0-2 .896-2 2v14c0 1.104.897 2 2 2h14a2 2 0 0 0 2-2v-8.668l-2 2z" />
                </svg>
              </button>
            ) : (
              <button
                className="cursor-pointer hover:text-black"
                onClick={() => toggleMode(todo.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="38"
                  height="38"
                  viewBox="0 0 32 32"
                  className="fill-current"
                >
                  <path d="m27.71 9.29l-5-5A1 1 0 0 0 22 4H6a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V10a1 1 0 0 0-.29-.71M12 6h8v4h-8Zm8 20h-8v-8h8Zm2 0v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8H6V6h4v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.41l4 4V26Z" />
                </svg>
              </button>
            )}
            <button
              className="hover:text-red-600 cursor-pointer"
              onClick={() => delTodoHandler(todo.id)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="34"
                height="34"
                viewBox="0 0 26 26"
                className="fill-current"
              >
                <path d="M11.5-.031c-1.958 0-3.531 1.627-3.531 3.594V4H4c-.551 0-1 .449-1 1v1H2v2h2v15c0 1.645 1.355 3 3 3h12c1.645 0 3-1.355 3-3V8h2V6h-1V5c0-.551-.449-1-1-1h-3.969v-.438c0-1.966-1.573-3.593-3.531-3.593zm0 2.062h3c.804 0 1.469.656 1.469 1.531V4H10.03v-.438c0-.875.665-1.53 1.469-1.53zM6 8h5.125c.124.013.247.031.375.031h3c.128 0 .25-.018.375-.031H20v15c0 .563-.437 1-1 1H7c-.563 0-1-.437-1-1zm2 2v12h2V10zm4 0v12h2V10zm4 0v12h2V10z" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TodoList;
