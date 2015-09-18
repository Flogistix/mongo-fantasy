const
    MongoClient = require ('mongodb').MongoClient,
    Tuple2      = require ('fantasy-tuples').Tuple2,

    R     = require ('ramda'),
    S     = require ('fantasy-states'),
    T     = require ('data.task'),
    IO    = require ('fantasy-io'),
    Maybe = require ('data.maybe'),

//  toMaybe :: a -> Maybe a
    toMaybe = function (x) { return x ? Maybe.of (x) : Maybe.Nothing (); },

//  maybe :: a -> (b -> a) -> Maybe a -> a
    maybe = R.curry (function (a, f, m) { if (m.isNothing) { return a; } else { return f (m.get ()); } }),

//  data Mongo a = StateT Task Eff a
    M = S.StateT (T),

//  modify :: (a -> b) -> Mongo Unit
    modify = M.modify,

//  set :: String -> a -> Mongo Unit
    set = R.curry (function (k, v) {
      return M.modify (function (s) {
        const n = R.clone (s);
        const fs = require ('fs');
        fs.writeFileSync ('./state.json', JSON.stringify(n));
        n[k] = v; return n;
      }).map (konst ({}));
    }),

//  getVal :: String -> Mongo Maybe a
    getVal = function (k) {
      return M.get.map (R.compose (toMaybe, R.prop (k)));
    },

//  rejectWithError :: Error -> Mongo Unit
    rejectWithError = function (e) { return M.lift (T.rejected (e)); },

//  defaultCallback :: (b -> c) -> (a -> c) -> b -> a -> c
    defaultCallback = R.curry (function (rej, res, b, a) {
      if (b) { return rej (b); }
      return res (a);
    }),

//  doWithDatabase :: (MongoDb -> a) -> Mongo a
    doWithDatabase = function (f) {
      const errmsg = "Couldn't connect to database.";
      return getVal ('db').chain (maybe (rejectWithError (errmsg), f));
    },

//  connect :: String -> Mongo Unit
    connect = function (uri) {
      const _conn = M.lift (new T (function (reject, resolve) {
        MongoClient.connect (uri, defaultCallback (reject, resolve));
      }));

      return _conn.chain (set ('db'));
    },

//  disconnect :: a -> Mongo a
    disconnect = function (x) {
      return M.get.chain (function (st) {
        return M.lift (new T (function (reject, resolve) {
          st.db.close (function (err) {
            if (err) { return reject (err); }
            else return resolve (x);
          });
        }));
      });
    },

//  getDailySensorDatas :: Mongo Cursor
    getDailySensorDatas = doWithDatabase (function (db) {
      return M.of (db.collection ('dailysensordatas')
                   .find    ({})
                   .sort    ({$natural: -1})
                   .limit   (10));
    }),

//  find :: String -> MongoArgs -> Mongo Cursor
    find = R.curry (function (collection, args) {
      const mongoFind = function (db) {
        return M.of (db.collection (collection).find (args));
      };
      return doWithDatabase (mongoFind);
    }),

//  findById :: String -> MongoFind -> String -> Mongo Cursor
    findById = R.curry (function (collection, id) {
      const mongoFind = R.curry (function (db) {
        const c =  db.collection (collection)
                     .find       ({_id: id})
                     .limit      (1);
        return M.of (c);
      });
      return doWithDatabase (mongoFind);
    }),

//  count :: Cursor -> Mongo Integer
    count = function (cursor) {
      const count = function (db) {
        return M.lift (new T (function (reject, resolve) {
          cursor.count (defaultCallback (reject, resolve));
        }));
      };
      return doWithDatabase (count);
    },

//  toArray :: Cursor -> Mongo [a]
    toArray = function (cursor) {
      return M.lift (new T (function (reject, resolve) {
        cursor.toArray (function (err, xs) {
          if (err) { reject (err); }
          else     { resolve (xs); }
        });
      }));
    },

//  evalSt :: Mongo a -> Task a
    evalSt = function (d, m) {  return m.evalState (d); },

//  execSt :: Mongo a -> Task a
    execSt = function (d, m) {  return m.exec (d); },

    nil = null;
module.exports = {
  connect: connect,
  disconnect: disconnect,
  getVal: getVal,
  set: set,
  modify: modify,
  M: M,
  of: M.of,
  lift: M.lift,
  getDailySensorDatas: getDailySensorDatas,

  count: count,
  findById: findById,
  find: find,

  evalSt: evalSt,
  execSt: execSt,
  toArray: toArray,
};
