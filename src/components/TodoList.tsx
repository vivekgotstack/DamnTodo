import { useEffect, useState } from "react";
import { Button } from "./ui/button";

type TodoProps = {
  id: Date;
  msg: string;
  mode: "edit" | "save";
};
function TodoList() {
  const [todos, setTodos] = useState<TodoProps[]>([]);
  useEffect(() => {
    try {
      const savedTodos = localStorage.getItem("todos");
      if (savedTodos) {
        // only parse if savedTodos is not null
        setTodos(
          JSON.parse(savedTodos).map((t: any) => ({ ...t, id: new Date(t.id) }))
        );
      }
    } catch (e) {
      console.error("Failed to load todos from localStorage:", e);
      setTodos([]); // fallback to empty array
    }
  }, []);

  const handleAddTodo = (todo: TodoProps): void => {
    setTodos((prev) => {
      const updatedTodos = [...prev, todo];
      localStorage.setItem("todos", JSON.stringify(updatedTodos));
      return updatedTodos;
    });
  };
  const handleDelTodo = (id: Date): void => {
    setTodos((prev) => {
      const updated = prev.filter((todo) => todo.id.getTime() !== id.getTime());
      localStorage.setItem("todos", JSON.stringify(updated));
      return updated;
    });
  };

  const toggleMode = (id: Date): void => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id.getTime() === id.getTime()
          ? { ...todo, mode: todo.mode === "edit" ? "save" : "edit" }
          : todo
      )
    );
  };

  const [input, setInput] = useState("");
  return (
    <div className="flex w-full min-h-screen items-center flex-col justify-center bg-gray-700 p-8">
      <div className="flex flex-col items-center justify-center gap-8 rounded-lg bg-gray-600 border-gray-700 p-6 border shadow-lg w-full sm:w-3/4 md:w-1/2 lg:w-1/2">
        <h1 className="font-bold w-full sm:w-1/2 text-2xl sm:text-3xl bg-neutral-900 text-white p-4 rounded-lg text-center line-clamp-1">
          TodoList
        </h1>
        <input
          type="text"
          placeholder="Enter your task here"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="p-2 border border-gray-800 bg-gray-400 rounded-lg text-center"
        />
        <div className="flex justify-center gap-8">
          <Button
            onClick={() => {
              if (input.trim() === "") return;
              handleAddTodo({ id: new Date(), msg: input, mode: "save" });
              setInput("");
            }}
          >
            Add
          </Button>
        </div>
      </div>
      {todos.map((todo) => (
        <div
          key={todo.id.toString()}
          className="mt-5 min-w-auto max-w-full wrap-break-word bg-gray-600 rounded-lg p-2 border border-gray-800 flex flex-col justify-between hover:border-black "
        >
          {todo.mode === "save" ? (
            <input
              className="text-xl p-1 rounded text-black border border-black focus:border-gray-700"
              value={todo.msg}
              onChange={(e) =>
                setTodos((prev) => {
                  const updated = prev.map((t) =>
                    t.id.getTime() === todo.id.getTime()
                      ? { ...t, msg: e.target.value }
                      : t
                  );
                  localStorage.setItem("todos", JSON.stringify(updated));
                  return updated;
                })
              }
            />
          ) : (
            <div className="text-xl h-auto">{todo.msg}</div>
          )}

          <div className="flex gap-5 mt-4">
            {todo.mode === "edit" ? (
              <button
                className="text-gray-900 hover:text-black transition-transform hover:-translate-y-0.5"
                onClick={() => toggleMode(todo.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="38"
                  height="38"
                  viewBox="0 0 26 24"
                  className="fill-current"
                >
                  <path d="m18.988 2.012l3 3L19.701 7.3l-3-3zM8 16h3l7.287-7.287l-3-3L8 13z" />
                  <path d="M19 19H8.158c-.026 0-.053.01-.079.01c-.033 0-.066-.009-.1-.01H5V5h6.847l2-2H5c-1.103 0-2 .896-2 2v14c0 1.104.897 2 2 2h14a2 2 0 0 0 2-2v-8.668l-2 2z" />
                </svg>
              </button>
            ) : (
              <button
                className="text-gray-900 hover:text-black transition-transform hover:-translate-y-0.5"
                onClick={() => toggleMode(todo.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="36"
                  height="38"
                  viewBox="0 0 32 32"
                  className="fill-current"
                >
                  <path d="m27.71 9.29l-5-5A1 1 0 0 0 22 4H6a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V10a1 1 0 0 0-.29-.71M12 6h8v4h-8Zm8 20h-8v-8h8Zm2 0v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8H6V6h4v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.41l4 4V26Z" />
                </svg>
              </button>
            )}

            <button
              className="text-gray-900 hover:text-red-800 hover:-translate-y-0.5 transition-transform"
              onClick={() => handleDelTodo(todo.id)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="36"
                viewBox="0 0 34 28"
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
