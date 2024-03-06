import {
  Canister,
  Err,
  Ok,
  Principal,
  Record,
  Result,
  StableBTreeMap,
  Variant,
  Vec,
  float64,
  int,
  int32,
  query,
  text,
  update,
} from 'azle';
import { v4 as uuidv4 } from 'uuid';

const TPost = Record({
  id: text,
  title: text,
  description: text,
  currentAmount: int32,
  target: int32,
  imageUrl: text,
  startDate: int,
  endDate: int,
  userId: Principal,
});

type TPost = typeof TPost.tsType;

const TUser = Record({
  email: text,
  username: text,
  bio: text,
  youtubeUrl: text,
  tiktokUrl: text,
  createdAt: int,
  profilePicture: text,
  posts: Vec(text),
  donations: Vec(text),
  walletPrincipal: text,
});
type TUser = typeof TUser.tsType;

const PostDTO = Record({
  id: text,
  title: text,
  description: text,
  currentAmount: float64,
  target: float64,
  imageUrl: text,
  startDate: int,
  endDate: int,
  username: text,
  userProfile: text,
});

const TDonation = Record({
  id: text,
  from: text,
  username: text,
  amount: float64,
  message: text,
  donationType: text,
});

type PostDTO = typeof PostDTO.tsType;
type TDonation = typeof TDonation.tsType;

const ErrorVariant = Variant({
  UserNotFound: text,
  UserAlreadyExist: text,
  UsernameOrEmailIsNotValid: text,
  PostNotFound: text,
  UsernameNotUnique: text,
  EmailNotUnique: text,
});

type ErrorVariant = typeof ErrorVariant.tsType;

const PostTree = StableBTreeMap<text, TPost>(0);
const UserTree = StableBTreeMap<Principal, TUser>(1);
const UserIndexUsername = StableBTreeMap<text, Principal>(2);
const UserIndexEmail = StableBTreeMap<text, Principal>(3);
const DonationTree = StableBTreeMap<text, TDonation>(4);

function UserMiddleware<T>(
  userId: Principal,
  handler: (user: TUser) => Result<T, ErrorVariant>
): Result<T, ErrorVariant> {
  const user = UserTree.get(userId);
  if (!user.Some) {
    return Err({ UserNotFound: 'User not found' });
  }
  return handler(user.Some);
}

export default Canister({
  greet: query([text], text, (name: string) => {
    return `Hello, ${name}!`;
  }),
  register: update(
    [text, text, Principal, text],
    Result(TUser, ErrorVariant),
    (
      username: string,
      email: string,
      principal: Principal,
      walletPrincipal: string
    ) => {
      const checkUsername = UserIndexUsername.get(username);
      const checkEmail = UserIndexEmail.get(email);
      if (checkUsername.Some || checkEmail.Some) {
        return Err({
          UsernameOrEmailIsNotValid: 'Username or Email is already exists',
        });
      }
      const checkUser = UserTree.get(principal);

      if (checkUser.Some) {
        return Err({
          UserAlreadyExist: 'User with ' + principal + ' Already exists',
        });
      }
      const newUser: TUser = {
        walletPrincipal: walletPrincipal,
        username: username,
        email: email,
        bio: 'There is nothing here ...',
        createdAt: BigInt(Date.now()),
        profilePicture:
          'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        tiktokUrl: '',
        youtubeUrl: '',
        posts: [],
        donations: [],
      };
      UserIndexEmail.insert(email, principal);
      UserIndexUsername.insert(username, principal);
      UserTree.insert(principal, newUser);
      return Ok(newUser);
    }
  ),
  getUser: query(
    [Principal],
    Result(TUser, ErrorVariant),
    (principal: Principal) => {
      const user = UserTree.get(principal);
      if (user.Some) {
        return Ok(user.Some);
      }
      return Err({ UserNotFound: 'There is no user with this principal' });
    }
  ),
  getUserByName: query(
    [text],
    Result(TUser, ErrorVariant),
    (username: string) => {
      const userPrincipal = UserIndexUsername.get(username);
      if (userPrincipal.Some) {
        const user = UserTree.get(userPrincipal.Some);
        if (user.Some) {
          return Ok(user.Some);
        } else {
          return Err({ UserNotFound: "User object didn't found on the tree" });
        }
      }
      return Err({ UserNotFound: 'There is no user with this username' });
    }
  ),
  // Test Only (to be deleted if production)
  getUsers: query([], Result(Vec(Principal), ErrorVariant), () => {
    const users: Vec<Principal> = UserIndexUsername.values();
    return Ok(users);
  }),
  createPost: update(
    [text, text, float64, text, int, int, Principal],
    Result(TPost, ErrorVariant),
    (
      title: string,
      description: string,
      target: number,
      imageUrl: text,
      startDate: int,
      endDate: int,
      userId: Principal
    ) => {
      const postId = uuidv4();
      return UserMiddleware(userId, (user: TUser) => {
        user.posts.push(postId);
        const newPost: TPost = {
          id: postId,
          title: title,
          description: description,
          currentAmount: 0,
          target: target,
          imageUrl: imageUrl,
          startDate: startDate,
          endDate: endDate,
          userId: userId,
        };
        UserTree.insert(userId, user);
        PostTree.insert(postId, newPost);
        return Ok(newPost);
      });
    }
  ),
  getPosts: query([], Result(Vec(PostDTO), ErrorVariant), () => {
    const posts: Vec<TPost> = PostTree.values();
    const postsDTO: Vec<PostDTO> = posts.map((post: TPost) => {
      const user = UserTree.get(post.userId).Some!;
      const { userId, ...postWithoutUserID } = post;
      const postDTO: PostDTO = {
        ...postWithoutUserID,
        username: user.username,
        userProfile: user.profilePicture,
      };
      return postDTO;
    });

    return Ok(postsDTO);
  }),
  getPost: query([text], Result(TPost, ErrorVariant), (postId: text) => {
    const post = PostTree.get(postId);
    if (post.Some) {
      return Ok(post.Some);
    }
    return Err({ PostNotFound: 'There is no post with this id' });
  }),
  getUserPosts: query(
    [Principal],
    Result(Vec(TPost), ErrorVariant),
    (userId: Principal) => {
      return UserMiddleware(userId, (user: TUser) => {
        const posts: Vec<TPost> = [];
        user.posts.forEach((postId: string) => {
          const post = PostTree.get(postId);
          if (post.Some) {
            posts.push(post.Some);
          }
        });
        return Ok(posts);
      });
    }
  ),
  updatePostDonation: update(
    [text, float64],
    Result(TPost, ErrorVariant),
    (postId: string, amount: number) => {
      const postInstance = PostTree.get(postId);
      if (postInstance.Some) {
        const post = postInstance.Some;
        post.currentAmount += amount;
        PostTree.insert(postId, post);
        return Ok(post);
      } else {
        return Err({ PostNotFound: "Post object didn't found on the tree" });
      }
    }
  ),
  createDonation: update(
    [text, text, float64, text, text],
    Result(TDonation, ErrorVariant),
    (
      from: string,
      username: string,
      amount: number,
      message: string,
      type: string
    ) => {
      const userPrincipal = UserIndexUsername.get(username);
      if (userPrincipal.Some) {
        const userId = userPrincipal.Some;
        const userInstance = UserTree.get(userPrincipal.Some);
        if (userInstance.Some) {
          const user = userInstance.Some;
          const donationId = uuidv4();
          user.donations.push(username);
          const newDonation: TDonation = {
            id: donationId,
            username: username,
            amount: amount,
            from: from,
            message: message,
            donationType: type,
          };
          UserTree.insert(userId, user);
          DonationTree.insert(donationId, newDonation);
          return Ok(newDonation);
        } else {
          return Err({ UserNotFound: "User object didn't found on the tree" });
        }
      }
    }
  ),
  getUserDonations: query(
    [Principal],
    Result(Vec(TDonation), ErrorVariant),
    (userId: Principal) => {
      return UserMiddleware(userId, (user: TUser) => {
        const donations: Vec<TDonation> = [];
        user.donations.forEach((donationId: string) => {
          const donation = DonationTree.get(donationId);
          if (donation.Some) {
            donations.push(donation.Some);
          }
        });
        return Ok(donations);
      });
    }
  ),
  saveUniqueProfile: update(
    [Principal, text, text],
    Result(TUser, ErrorVariant),
    (principal: Principal, newUsername: text, newEmail: text) => {
      return UserMiddleware(principal, (user: TUser) => {
        const usernameCheck = UserIndexUsername.get(newUsername);
        const emailCheck = UserIndexEmail.get(newEmail);
        if (usernameCheck.Some && newUsername != user.username) {
          return Err({
            UsernameNotUnique: `Usernam e ${newUsername} is not Unique`,
          });
        }

        if (emailCheck.Some && newEmail != user.email) {
          return Err({ EmailNotUnique: `Email ${newEmail} is not unique` });
        }

        UserIndexEmail.remove(user.email);
        UserIndexUsername.remove(user.username);
        user.email = newEmail;
        user.username = newUsername;
        UserTree.insert(principal, user);
        UserIndexEmail.insert(newEmail, principal);
        UserIndexUsername.insert(newUsername, principal);
        return Ok(user);
      });
    }
  ),
  saveProfile: update(
    [Principal, text, text, text],
    Result(TUser, ErrorVariant),
    (principal: Principal, bio: text, youtubeUrl: text, tiktokUrl: text) => {
      return UserMiddleware(principal, (user: TUser) => {
        user.bio = bio;
        user.tiktokUrl = tiktokUrl;
        user.youtubeUrl = youtubeUrl;
        UserTree.insert(principal, user);
        return Ok(user);
      });
    }
  ),
});
