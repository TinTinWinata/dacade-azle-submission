import { Canister, Err, Ok, Opt, Principal, Record, Result, StableBTreeMap, Variant, Vec, query, text, update } from 'azle';


const User = Record({
  id: Principal,
  name: text
})

const List = Record({
  id: Principal,
  userId: Principal,
  text: text
})


type User = typeof User.tsType;
type List = typeof List.tsType

// global variable that stored in the heap
// 0 -> identifier of the stable data structure 
let listTree = StableBTreeMap<Principal, Vec<List>>(0);
let userTree = StableBTreeMap<Principal, User>(1);

const ListError = Variant({
  UserDoesNotExists: Principal,
  ListDoesNotExists: Principal
});

// export canister's definition to the Azle IC environment
export default Canister({
  whoami: query([Principal], Result(User, ListError), (userId) => {
    const userOpt = userTree.get(userId);
    if('None' in userOpt){
      return Err({ListDoesNotExists: userId})
    }
    const user = userOpt.Some
    return Ok(user)
  }), 
  deleteAccount: update([Principal], Result(text, ListError), (userId) => {
    const userOpt = userTree.get(userId)
    if('None' in userOpt){
      return Err({ListDoesNotExists: userId})
    }
    userTree.remove(userId)
    listTree.remove(userId)
    return Ok('Succesfully delete accounts')
  }), 
  register: update([text], User, (name)=> {
    const from = generateId();
    const user: User = {
      id: from,
      name
    }
    const newList : Vec<List> = []
    listTree.insert(from, newList)
    userTree.insert(from, user);
    return user;
  }),
  get: query([Principal], Opt(Vec(List)), (from) => {
    return listTree.get(from);
  }),
  delete: update([Principal, Principal], Result(Vec(List), ListError), (from, listId) => {
    const listOpt = listTree.get(from);
    const lists = listOpt.Some
    if(lists){
      const updatedList = lists.filter((list) => list.id.toString() !== listId.toString())
      listTree.insert(from, updatedList)
      return Ok(updatedList)
    }
    return Err({ListDoesNotExists: listId})
  }),

  update: update([Principal, Principal, text], Result(List, ListError), (from, listId, text) => {
    const listOpt = listTree.get(from);
    const lists = listOpt.Some;
    if(lists){
      const list = lists.find((list) => list.id.toString() === listId.toString())
      if(list){
        list.text = text;
        listTree.insert(from, lists)
        return Ok(list)
      }
      return Err({ListDoesNotExists: listId})
    }
    return Err({UserDoesNotExists: from})
  }),
  add: update([Principal, text], Result(List, ListError), (from, text) => {
    let userOpt = userTree.get(from);

    if('None' in userOpt){
      return Err({UserDoesNotExists: from})
    }
    
    const id = generateId();
    const list: List = {
      text,
      userId: from,
      id
    }
    
    const listOpt = listTree.get(from);
    const lists = listOpt.Some;
    if(lists){
      lists.push(list)
      listTree.insert(from, lists)
    }

    return Ok(list)
  }),
})

function generateId(): Principal{
  const randomBytes = new Array(29).fill(0).map((_)=> Math.floor(Math.random() * 256))
  return Principal.fromUint8Array(Uint8Array.from(randomBytes))
}